import type postgres from "postgres";
import type { ModerationProvider } from "./ai";
import { enqueueModeration, processModerationJobs, textHash, type ProcessResult } from "./queue";
import type { ModerationField } from "./script";

/**
 * `pnpm moderation:recheck` (SPEC-demonstrace §4.2): po přidání klíče projde AI kontrolou
 * všechny už schválené vlastní texty (slogany i jména).
 *
 * Texty se NEPŘEPÍNAJÍ zpět na `pending` – v davu zůstanou vidět jako `approved`, dokud je
 * AI neodmítne (pak `rejected` a dlaždice se přegeneruje). Důvod: prošly skriptem a byly
 * zveřejněné podle pravidel platných bez klíče; hromadné skrytí celého davu do doby, než
 * fronta doběhne, by bylo horší než krátké okno do verdiktu. Schválení AI se zapíše do
 * moderation_log jako `confirm_<pole>`.
 */

export interface RecheckResult {
  enqueued: number;
  alreadyQueued: number;
  processed: ProcessResult;
}

export async function enqueueRecheck(sql: postgres.Sql): Promise<{ enqueued: number; alreadyQueued: number }> {
  const rows = await sql<{ id: string; field: ModerationField; text: string }[]>`
    select id, 'slogan' as field, slogan_custom as text from app.demonstrator
      where slogan_custom is not null and slogan_status = 'approved' and hidden_at is null
    union all
    select id, 'name' as field, first_name as text from app.demonstrator
      where first_name is not null and name_status = 'approved' and hidden_at is null`;
  const pending = await sql<{ demonstrator_id: string; field: string; text_hash: string }[]>`
    select demonstrator_id, field, text_hash from app.moderation_job where status = 'pending'`;
  const queued = new Set(pending.map((p) => `${p.demonstrator_id}:${p.field}:${p.text_hash}`));
  let enqueued = 0;
  let alreadyQueued = 0;
  for (const r of rows) {
    if (queued.has(`${r.id}:${r.field}:${textHash(r.text)}`)) {
      alreadyQueued++;
      continue;
    }
    await enqueueModeration(sql, r.id, r.field, r.text);
    enqueued++;
  }
  return { enqueued, alreadyQueued };
}

/** Zařadí a zpracuje po dávkách, dokud jsou splatné úlohy (chybující čekají na backoff → cron). */
export async function runRecheck(
  sql: postgres.Sql,
  opts: { batch?: number; provider?: ModerationProvider | null; onBatch?: (r: ProcessResult) => void } = {},
): Promise<RecheckResult> {
  const queued = await enqueueRecheck(sql);
  const total: ProcessResult = { claimed: 0, approved: 0, rejected: 0, stale: 0, failed: 0 };
  for (;;) {
    const r = await processModerationJobs({ sql, limit: opts.batch ?? 20, provider: opts.provider });
    opts.onBatch?.(r);
    for (const k of Object.keys(total) as (keyof ProcessResult)[]) total[k] += r[k];
    if (r.claimed === 0) break;
  }
  return { ...queued, processed: total };
}
