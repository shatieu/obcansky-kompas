import type postgres from "postgres";
import { hmac } from "@/lib/crypto";

/**
 * Rate limity v Postgresu (tabulka app.rate_limit, SPEC §14.1/§14.3): pevné okno, počítadlo
 * na (bucket, window_start). IP se nikdy neukládá – jen HMAC s denní solí (datum UTC).
 */

export const HOUR = 3600;

export const LIMITS = {
  signPerIp: { limit: 5, windowSec: HOUR },
  signPerEmail: { limit: 3, windowSec: HOUR },
  editLinkPerEmail: { limit: 3, windowSec: HOUR },
  editLinkPerIp: { limit: 10, windowSec: HOUR },
  reportPerIp: { limit: 5, windowSec: HOUR },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Začátek pevného okna, do kterého `now` spadá. */
export function windowStart(now: Date, windowSec: number): Date {
  const ms = windowSec * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/** Den (UTC) jako sůl – po půlnoci vznikne pro stejnou IP jiný klíč. */
export function daySalt(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** HMAC IP adresy s denní solí. Samotná IP nikam neodchází. */
export function ipKey(ip: string, now = new Date()): string {
  return hmac(`ip:${daySalt(now)}:${ip.trim().toLowerCase()}`);
}

export interface HitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

/** Započte pokus do bucketu a řekne, jestli je ještě v limitu. */
export async function hit(
  sql: postgres.Sql | postgres.TransactionSql,
  name: LimitName,
  key: string,
  now = new Date(),
): Promise<HitResult> {
  const { limit, windowSec } = LIMITS[name];
  const bucket = `${name}:${key}`;
  const start = windowStart(now, windowSec);
  const [row] = await sql<{ count: number }[]>`
    insert into app.rate_limit (bucket, window_start, count)
    values (${bucket}, ${start.toISOString()}, 1)
    on conflict (bucket, window_start) do update set count = app.rate_limit.count + 1
    returning count`;
  const count = Number(row?.count ?? 1);
  return { allowed: count <= limit, count, limit };
}

/** Úklid: počítadla starší než `days` dní (IP HMAC max. 7 dní, SPEC §14.3). */
export async function pruneRateLimits(sql: postgres.Sql, days = 2): Promise<number> {
  const r = await sql`delete from app.rate_limit where window_start < now() - make_interval(days => ${days})`;
  return r.count;
}
