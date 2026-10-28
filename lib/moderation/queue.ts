import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import type postgres from "postgres";
import { getSql } from "@/lib/db/client";
import { aiEnabled, getModerationProvider, ModerationError, type ModerationProvider } from "./ai";
import type { ModerationField } from "./script";

/**
 * Fronta AI kontroly app.moderation_job (SPEC-demonstrace §4.2, stejný vzor jako email_job).
 * Zápis: enqueueModeration() v transakci připojení/úpravy. Zpracování: processModerationJobs()
 * z after() hned po zápisu a z cronu. Chyba AI → úloha zůstává `pending`, attempts+1, backoff;
 * nikdy se kvůli chybě neschválí. Verdikt se použije, jen když text mezitím nezměnil
 * (sha256 v text_hash proti aktuálnímu sloupci, ověřeno přímo v UPDATE).
 */

type Sql = postgres.Sql | postgres.TransactionSql;

export function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Stav volného textu po projití skriptem: bez AI rovnou schválený, s AI čeká (§4.2). */
export function initialModerationStatus(env: Record<string, string | undefined> = process.env): "approved" | "pending" {
  return aiEnabled(env) ? "pending" : "approved";
}

export const TILE_SIZE = 1000;
export function tileTag(positionIndex: number): string {
  return `demo-tile:${Math.floor(positionIndex / TILE_SIZE)}`;
}

/** Zahodí cache dlaždice (a karty účastníka). Mimo Next request scope (skripty, testy) tiše nic. */
export function revalidateTile(positionIndex: number, demonstratorId?: string): void {
  try {
    revalidateTag(tileTag(positionIndex), { expire: 0 });
    if (demonstratorId) revalidateTag(`demo-person:${demonstratorId}`, { expire: 0 });
  } catch {
    /* mimo Next */
  }
}

const COLUMNS = {
  slogan: { text: "slogan_custom", status: "slogan_status" },
  name: { text: "first_name", status: "name_status" },
} as const;

/**
 * Zařadí text do AI kontroly. Starší čekající úlohy stejného pole se uzavřou (text se změnil).
 * Volat ve stejné transakci, která text zapsala; `text` = přesně uložená hodnota.
 */
export async function enqueueModeration(tx: Sql, demonstratorId: string, field: ModerationField, text: string): Promise<string> {
  await tx`
    update app.moderation_job set status = 'done', last_error = 'superseded'
    where demonstrator_id = ${demonstratorId} and field = ${field} and status = 'pending'`;
  const [row] = await tx<{ id: string }[]>`
    insert into app.moderation_job (demonstrator_id, field, text_hash, status)
    values (${demonstratorId}, ${field}, ${textHash(text)}, 'pending')
    returning id`;
  return row!.id;
}

/** Odklad po `attempts` neúspěších: 1, 3, 9, 27, 81 min, dál 81 min (jako e-maily). */
export function backoffSeconds(attempts: number): number {
  return 60 * 3 ** Math.min(Math.max(attempts - 1, 0), 4);
}

export interface ProcessResult {
  claimed: number;
  approved: number;
  rejected: number;
  /** Text se mezitím změnil nebo už byl odmítnut jinak (CLI, nahlášení). */
  stale: number;
  failed: number;
}

export interface ProcessOptions {
  limit?: number;
  sql?: postgres.Sql;
  /** Výchozí podle env (getModerationProvider); v testech mock. */
  provider?: ModerationProvider | null;
  revalidate?: (positionIndex: number, demonstratorId: string) => void;
}

interface ClaimedJob {
  id: string;
  demonstrator_id: string;
  field: ModerationField;
  text_hash: string;
  attempts: number;
}

/** Zpracuje splatné úlohy. Bez AI (žádný klíč) nic nedělá – úlohy čekají na klíč. */
export async function processModerationJobs(opts: ProcessOptions = {}): Promise<ProcessResult> {
  const out: ProcessResult = { claimed: 0, approved: 0, rejected: 0, stale: 0, failed: 0 };
  let provider: ModerationProvider | null;
  let configError: string | null = null;
  try {
    provider = opts.provider !== undefined ? opts.provider : getModerationProvider();
  } catch (e) {
    // Zapnuté, ale špatně nastavené (např. chybí MODERATION_MODEL): úlohy zůstanou pending.
    provider = null;
    configError = e instanceof ModerationError ? e.code : "not_configured";
  }
  if (!provider && !configError) return out;
  const sql = opts.sql ?? getSql();
  const revalidate = opts.revalidate ?? revalidateTile;
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 100));

  // Rezervace: posun next_attempt_at, aby úlohu nevzal souběžný běh (FOR UPDATE SKIP LOCKED).
  const jobs = await sql<ClaimedJob[]>`
    update app.moderation_job j set next_attempt_at = now() + interval '10 minutes'
    where j.id in (
      select id from app.moderation_job
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      limit ${limit}
      for update skip locked
    )
    returning j.id, j.demonstrator_id, j.field, j.text_hash, j.attempts`;
  out.claimed = jobs.length;

  for (const job of jobs) {
    const col = COLUMNS[job.field];
    const [d] = await sql<{ text: string | null; status: string; position_index: number }[]>`
      select ${sql(col.text)} as text, ${sql(col.status)} as status, position_index
      from app.demonstrator where id = ${job.demonstrator_id}`;
    if (!d || d.text === null || textHash(d.text) !== job.text_hash || (d.status !== "pending" && d.status !== "approved")) {
      await sql`update app.moderation_job set status = 'done', last_error = 'stale' where id = ${job.id}`;
      out.stale++;
      continue;
    }

    let verdict;
    try {
      if (!provider) throw new ModerationError("AI není nastavená", configError ?? "not_configured");
      verdict = await provider.classify(d.text, job.field);
    } catch (e) {
      const code = e instanceof ModerationError ? e.code : "classify_failed";
      await sql`
        update app.moderation_job set
          attempts = attempts + 1, last_error = ${code},
          next_attempt_at = now() + ${backoffSeconds(job.attempts + 1)}::int * interval '1 second'
        where id = ${job.id}`;
      console.error(`[moderation] failed field=${job.field} code=${code}`);
      out.failed++;
      continue;
    }

    const newStatus = verdict.verdict === "ok" ? "approved" : "rejected";
    const applied = await sql.begin(async (tx) => {
      // Podmíněný zápis: jen když text pořád odpovídá hashi a nebyl mezitím odmítnut jinak.
      const [cur] = await tx<{ prev: string }[]>`
        select ${tx(col.status)} as prev from app.demonstrator where id = ${job.demonstrator_id} for update`;
      const rows =
        cur && (cur.prev === "pending" || cur.prev === "approved")
          ? await tx`
              update app.demonstrator set ${tx(col.status)} = ${newStatus}, updated_at = now()
              where id = ${job.demonstrator_id}
                and encode(sha256(convert_to(${tx(col.text)}, 'UTF8')), 'hex') = ${job.text_hash}
              returning id`
          : [];
      const row = rows.length ? cur : undefined;
      if (!row) {
        await tx`update app.moderation_job set status = 'done', attempts = attempts + 1, last_error = 'stale' where id = ${job.id}`;
        return null;
      }
      const action = verdict.verdict === "reject" ? `reject_${job.field}` : row.prev === "approved" ? `confirm_${job.field}` : `approve_${job.field}`;
      await tx`
        insert into app.moderation_log (demonstrator_id, action, actor, category)
        values (${job.demonstrator_id}, ${action}, 'ai', ${verdict.category})`;
      await tx`
        update app.moderation_job set status = 'done', attempts = attempts + 1, last_error = null,
          verdict = ${verdict.verdict}, category = ${verdict.category}
        where id = ${job.id}`;
      return row.prev;
    });
    if (applied === null) {
      out.stale++;
      continue;
    }
    if (applied !== newStatus) revalidate(d.position_index, job.demonstrator_id);
    if (verdict.verdict === "ok") out.approved++;
    else out.rejected++;
  }
  return out;
}
