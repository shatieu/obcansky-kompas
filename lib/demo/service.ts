import type postgres from "postgres";
import { sha256Hex } from "@/lib/crypto";
import { REPORT_HIDE_THRESHOLD, type ModerationField, type ModerationStatus, type Pose, type SignColor } from "./constants";

/**
 * Zápisy online demonstrace (SPEC-demonstrace §3, §4.3, §7). Každá operace = jedna transakce.
 * Volné texty sem chodí už po skriptové kontrole (scriptCheck v route handleru), tady se jen
 * rozhodne stav: s AI → `pending` + úloha do fronty ve stejné transakci, bez AI → `approved`.
 */

type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;
type Db = Sql | Tx;

export type Enqueue = (tx: Tx, demonstratorId: string, field: ModerationField, text: string) => Promise<unknown>;

export interface DemoWrite {
  sloganPresetId: string | null;
  sloganCustom: string | null;
  pose: Pose;
  signColor: SignColor;
  seed: number;
  rerollCount: number;
  firstName: string | null;
}

export interface WriteOpts {
  /** AI moderace zapnutá (aiEnabled()). */
  ai: boolean;
  /** enqueueModeration z lib/moderation; povinné, když ai = true. */
  enqueue?: Enqueue;
  poc: boolean;
}

export type JoinOutcome =
  | { status: "ok"; id: string; index: number; pending: ModerationField[] }
  | { status: "exists"; id: string; index: number }
  | { status: "not_eligible" };

export type EditOutcome = { status: "ok"; id: string; index: number; pending: ModerationField[] } | { status: "not_found" };

/** Nový stav volného textu. Nezměněný text si stav ponechá (i `rejected` z demo:ban-text). */
export function nextStatus(
  newText: string | null,
  oldText: string | null,
  oldStatus: ModerationStatus,
  ai: boolean,
): { status: ModerationStatus; moderate: boolean } {
  if (!newText) return { status: "none", moderate: false };
  if (oldText === newText && oldStatus !== "none") return { status: oldStatus, moderate: false };
  return ai ? { status: "pending", moderate: true } : { status: "approved", moderate: false };
}

async function enqueueAll(
  tx: Tx,
  id: string,
  opts: WriteOpts,
  items: [ModerationField, string | null, boolean][],
): Promise<ModerationField[]> {
  const pending: ModerationField[] = [];
  for (const [field, text, moderate] of items) {
    if (!moderate || !text) continue;
    if (!opts.enqueue) throw new Error("AI moderace zapnutá, ale chybí enqueue");
    await opts.enqueue(tx, id, field, text);
    pending.push(field);
  }
  return pending;
}

async function joinOnce(sql: Sql, signatureId: string, d: DemoWrite, opts: WriteOpts): Promise<JoinOutcome> {
  return sql.begin(async (tx) => {
    const [sig] = await tx<{ verification_level: string; withdrawn_at: Date | null; is_poc: boolean }[]>`
      select verification_level, withdrawn_at, is_poc from app.signature where id = ${signatureId} for update`;
    if (!sig || sig.withdrawn_at || sig.verification_level === "unverified") return { status: "not_eligible" } as const;
    const [existing] = await tx<{ id: string; position_index: number }[]>`
      select id, position_index from app.demonstrator where signature_id = ${signatureId}`;
    if (existing) return { status: "exists", id: existing.id, index: existing.position_index } as const;

    const slogan = nextStatus(d.sloganCustom, null, "none", opts.ai);
    const name = nextStatus(d.firstName, null, "none", opts.ai);
    const [row] = await tx<{ id: string; position_index: number }[]>`
      insert into app.demonstrator (
        signature_id, seed, pose, sign_color, slogan_preset_id, slogan_custom, slogan_status,
        first_name, name_status, consent_at, reroll_count, is_poc)
      values (
        ${signatureId}, ${d.seed}, ${d.pose}, ${d.signColor}, ${d.sloganCustom ? null : d.sloganPresetId},
        ${d.sloganCustom}, ${slogan.status}, ${d.firstName}, ${name.status}, now(), ${d.rerollCount},
        ${opts.poc || sig.is_poc})
      returning id, position_index`;
    const pending = await enqueueAll(tx, row!.id, opts, [
      ["slogan", d.sloganCustom, slogan.moderate],
      ["name", d.firstName, name.moderate],
    ]);
    return { status: "ok", id: row!.id, index: row!.position_index, pending } as const;
  });
}

/** Připojení k demonstraci: jeden panáček na ověřený, neodvolaný podpis. */
export async function joinDemonstration(sql: Sql, signatureId: string, d: DemoWrite, opts: WriteOpts): Promise<JoinOutcome> {
  try {
    return await joinOnce(sql, signatureId, d, opts);
  } catch (e) {
    // Souběh dvou připojení stejného podpisu: druhé narazí na unique signature_id.
    if ((e as { code?: string }).code === "23505") return joinOnce(sql, signatureId, d, opts);
    throw e;
  }
}

/** Úprava vlastního panáčka. Místo v davu (position_index) zůstává. */
export async function editDemonstrator(
  sql: Sql,
  id: string,
  ownerSignatureId: string,
  d: DemoWrite,
  opts: WriteOpts,
): Promise<EditOutcome> {
  return sql.begin(async (tx) => {
    const [cur] = await tx<
      {
        id: string;
        position_index: number;
        slogan_custom: string | null;
        slogan_status: ModerationStatus;
        first_name: string | null;
        name_status: ModerationStatus;
      }[]
    >`
      select d.id, d.position_index, d.slogan_custom, d.slogan_status, d.first_name, d.name_status
      from app.demonstrator d join app.signature s on s.id = d.signature_id
      where d.id = ${id} and d.signature_id = ${ownerSignatureId} and s.withdrawn_at is null
      for update of d`;
    if (!cur) return { status: "not_found" } as const;
    const slogan = nextStatus(d.sloganCustom, cur.slogan_custom, cur.slogan_status, opts.ai);
    const name = nextStatus(d.firstName, cur.first_name, cur.name_status, opts.ai);
    await tx`
      update app.demonstrator set
        seed = ${d.seed}, pose = ${d.pose}, sign_color = ${d.signColor},
        slogan_preset_id = ${d.sloganCustom ? null : d.sloganPresetId}, slogan_custom = ${d.sloganCustom},
        slogan_status = ${slogan.status}, first_name = ${d.firstName}, name_status = ${name.status},
        reroll_count = ${d.rerollCount}, updated_at = now()
      where id = ${id}`;
    // Nevyřízené úlohy pro změněné nebo odebrané pole už nejsou potřeba.
    const stale: string[] = [];
    if (slogan.moderate || !d.sloganCustom) stale.push("slogan");
    if (name.moderate || !d.firstName) stale.push("name");
    if (stale.length) await tx`delete from app.moderation_job where demonstrator_id = ${id} and status = 'pending' and field in ${tx(stale)}`;
    const pending = await enqueueAll(tx, id, opts, [
      ["slogan", d.sloganCustom, slogan.moderate],
      ["name", d.firstName, name.moderate],
    ]);
    return { status: "ok", id, index: cur.position_index, pending } as const;
  });
}

/** Panáček vlastníka (pro „Najdi mě“ a /v/[uuid]). */
export async function findBySignature(sql: Db, signatureId: string): Promise<{ id: string; index: number } | null> {
  const [row] = await sql<{ id: string; position_index: number }[]>`
    select d.id, d.position_index from app.demonstrator d join app.signature s on s.id = d.signature_id
    where d.signature_id = ${signatureId} and s.withdrawn_at is null`;
  return row ? { id: row.id, index: row.position_index } : null;
}

/** Odvolání podpisu: smaže panáčka (s ním kaskádou fronta, nahlášení a log). Volá withdrawSignature. */
export async function deleteForSignature(sql: Db, signatureId: string): Promise<{ id: string; index: number } | null> {
  const [row] = await sql<{ id: string; position_index: number }[]>`
    delete from app.demonstrator where signature_id = ${signatureId} returning id, position_index`;
  return row ? { id: row.id, index: row.position_index } : null;
}

/** Platný (nespotřebovaný, neprošlý) odkaz pro úpravu → id podpisu. Token se nespotřebuje. */
export async function signatureFromEditToken(sql: Db, token: string): Promise<string | null> {
  const [row] = await sql<{ signature_id: string }[]>`
    select r.signature_id
    from app.email_token t
    join app.signer r on r.id = t.signer_id
    join app.signature s on s.id = r.signature_id
    where t.token_hash = ${sha256Hex(token)} and t.purpose = 'edit' and t.used_at is null
      and t.expires_at > now() and s.withdrawn_at is null`;
  return row?.signature_id ?? null;
}

// ---------- Nahlášení a ruční zásahy (§4.3) ----------

export type ReportOutcome =
  | { status: "ok"; index: number; hidden: boolean; newlyHidden: boolean }
  | { status: "duplicate"; index: number }
  | { status: "not_found" };

/**
 * Nahlášení: max. 1 na IP (HMAC) a panáčka. Po REPORT_HIDE_THRESHOLD různých IP se vlastní text
 * a jméno skryjí (hidden_at) do ruční kontroly a zásah se zapíše do moderation_log (actor reports).
 */
export async function reportDemonstrator(sql: Sql, id: string, ipHmac: string): Promise<ReportOutcome> {
  return sql.begin(async (tx) => {
    const [d] = await tx<{ position_index: number; hidden_at: Date | null }[]>`
      select position_index, hidden_at from app.demonstrator where id = ${id} for update`;
    if (!d) return { status: "not_found" } as const;
    const ins = await tx`
      insert into app.demonstrator_report (demonstrator_id, ip_hmac) values (${id}, ${ipHmac})
      on conflict do nothing`;
    if (ins.count === 0) return { status: "duplicate", index: d.position_index } as const;
    await tx`update app.demonstrator set report_count = report_count + 1 where id = ${id}`;
    const [c] = await tx<{ n: number }[]>`select count(*)::int as n from app.demonstrator_report where demonstrator_id = ${id}`;
    let newlyHidden = false;
    if (!d.hidden_at && c!.n >= REPORT_HIDE_THRESHOLD) {
      await tx`update app.demonstrator set hidden_at = now(), updated_at = now() where id = ${id}`;
      await tx`insert into app.moderation_log (demonstrator_id, action, actor) values (${id}, 'hide', 'reports')`;
      newlyHidden = true;
    }
    return { status: "ok", index: d.position_index, hidden: Boolean(d.hidden_at) || newlyHidden, newlyHidden } as const;
  });
}

export type ModAction = "hide" | "unhide" | "ban-text";

/** Ruční zásah z CLI (demo:hide / demo:unhide / demo:ban-text). Vrací index pro revalidaci, nebo null. */
export async function moderateDemonstrator(sql: Sql, id: string, action: ModAction): Promise<{ index: number } | null> {
  return sql.begin(async (tx) => {
    const [d] = await tx<{ position_index: number }[]>`select position_index from app.demonstrator where id = ${id} for update`;
    if (!d) return null;
    if (action === "hide") {
      await tx`update app.demonstrator set hidden_at = coalesce(hidden_at, now()), updated_at = now() where id = ${id}`;
    } else if (action === "unhide") {
      // Po ruční kontrole se nahlášení vynulují – ke skrytí jsou pak potřeba nová 3.
      await tx`update app.demonstrator set hidden_at = null, report_count = 0, updated_at = now() where id = ${id}`;
      await tx`delete from app.demonstrator_report where demonstrator_id = ${id}`;
    } else {
      await tx`
        update app.demonstrator set
          slogan_status = case when slogan_custom is not null then 'rejected' else slogan_status end,
          name_status = case when first_name is not null then 'rejected' else name_status end,
          updated_at = now()
        where id = ${id}`;
      await tx`delete from app.moderation_job where demonstrator_id = ${id} and status = 'pending'`;
    }
    await tx`insert into app.moderation_log (demonstrator_id, action, actor) values (${id}, ${action}, 'cli')`;
    return { index: d.position_index };
  });
}

export interface ReportedRow {
  id: string;
  index: number;
  reportCount: number;
  hidden: boolean;
  sloganCustom: string | null;
  sloganStatus: ModerationStatus;
  firstName: string | null;
  nameStatus: ModerationStatus;
  updatedAt: string;
}

/** Výpis pro `pnpm demo:reported`: skrytí a nahlášení, nejvíc nahlášení první. */
export async function listReported(sql: Sql, limit = 200): Promise<ReportedRow[]> {
  const rows = await sql<
    {
      id: string;
      position_index: number;
      report_count: number;
      hidden_at: Date | null;
      slogan_custom: string | null;
      slogan_status: ModerationStatus;
      first_name: string | null;
      name_status: ModerationStatus;
      updated_at: Date;
    }[]
  >`
    select id, position_index, report_count, hidden_at, slogan_custom, slogan_status, first_name, name_status, updated_at
    from app.demonstrator where report_count > 0 or hidden_at is not null
    order by (hidden_at is not null) desc, report_count desc, updated_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    index: r.position_index,
    reportCount: r.report_count,
    hidden: Boolean(r.hidden_at),
    sloganCustom: r.slogan_custom,
    sloganStatus: r.slogan_status,
    firstName: r.first_name,
    nameStatus: r.name_status,
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

/** Úklid: nahlášení starší než `days` dní (IP HMAC max. 7 dní, SPEC §14.3). Skrytí zůstává. */
export async function pruneReports(sql: Sql, days = 7): Promise<number> {
  const r = await sql`delete from app.demonstrator_report where created_at < now() - make_interval(days => ${days})`;
  return r.count;
}
