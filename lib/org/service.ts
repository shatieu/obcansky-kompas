import type postgres from "postgres";
import type { Answers, QuestionId } from "@/lib/compose/types";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { ipKey } from "@/lib/rate-limit";
import { ORG_TOKEN_RE, type InviteInput, type OrgType } from "./input";

/**
 * Strany a hnutí v DB (SPEC §12, tabulka app.organization §14.1). Token jen jako SHA-256
 * (§14.3). Odeslání je jediný atomický UPDATE: uloží odpovědi, nastaví submitted_at a
 * token_hash = null, takže odkaz přestane platit a druhé odeslání nic nezmění.
 */

type Db = postgres.Sql | postgres.TransactionSql;

export const tokenHash = (token: string) => sha256Hex(token);

export interface Invitation {
  id: string;
  token: string;
  /** true = existující nevyplněný subjekt dostal nový odkaz (starý přestal platit). */
  reissued: boolean;
}

export class InviteError extends Error {
  constructor(public code: "exists" | "submitted") {
    super(code);
  }
}

export async function createInvitation(sql: Db, input: InviteInput, opts: { reissue?: boolean } = {}): Promise<Invitation> {
  const token = randomToken();
  const h = tokenHash(token);
  const [existing] = await sql<{ id: string; submitted_at: Date | null }[]>`
    select id, submitted_at from app.organization where lower(name) = lower(${input.name}) and not is_seed limit 1`;
  if (existing) {
    if (existing.submitted_at) throw new InviteError("submitted");
    if (!opts.reissue) throw new InviteError("exists");
    await sql`
      update app.organization
      set token_hash = ${h}, type = ${input.type}, contact = ${input.contact}, invited_at = now()
      where id = ${existing.id} and submitted_at is null`;
    return { id: existing.id, token, reissued: true };
  }
  const [row] = await sql<{ id: string }[]>`
    insert into app.organization (name, type, contact, token_hash)
    values (${input.name}, ${input.type}, ${input.contact}, ${h})
    returning id`;
  return { id: row!.id, token, reissued: false };
}

export interface PendingOrganization {
  id: string;
  name: string;
  type: OrgType;
}

/** Nevyplněný subjekt podle tokenu; neplatný, použitý nebo ukázkový token = null. */
export async function findPendingByToken(sql: Db, token: string): Promise<PendingOrganization | null> {
  if (!ORG_TOKEN_RE.test(token)) return null;
  const [row] = await sql<PendingOrganization[]>`
    select id, name, type from app.organization
    where token_hash = ${tokenHash(token)} and submitted_at is null and not is_seed`;
  return row ?? null;
}

export async function submitAnswers(
  sql: Db,
  token: string,
  answers: Answers,
  justifications: Partial<Record<QuestionId, string>>,
): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!ORG_TOKEN_RE.test(token)) return { ok: false };
  const [row] = await sql<{ id: string }[]>`
    update app.organization
    set answers = ${sql.json(answers as postgres.JSONValue)},
        justifications = ${sql.json(justifications as postgres.JSONValue)},
        submitted_at = now(),
        token_hash = null
    where token_hash = ${tokenHash(token)} and submitted_at is null and not is_seed
    returning id`;
  return row ? { ok: true, id: row.id } : { ok: false };
}

export interface PublicOrganization {
  id: string;
  name: string;
  type: OrgType;
  invitedAt: string;
  submittedAt: string | null;
  answers: Answers | null;
  justifications: Partial<Record<QuestionId, string>> | null;
  isSeed: boolean;
}

/** České abecední řazení (Č za C, Ž na konci). */
export function sortCzech<T extends { name: string }>(list: T[]): T[] {
  const coll = new Intl.Collator("cs", { sensitivity: "base", numeric: true });
  return [...list].sort((a, b) => coll.compare(a.name, b.name));
}

/** Veřejný seznam pro /hnuti – bez kontaktu a tokenu. Seed jen s DEMO_MODE (includeSeed). */
export async function listPublicOrganizations(sql: Db, opts: { includeSeed: boolean }): Promise<PublicOrganization[]> {
  const rows = await sql<
    {
      id: string;
      name: string;
      type: OrgType;
      invited_at: Date;
      submitted_at: Date | null;
      answers: Answers | null;
      justifications: Partial<Record<QuestionId, string>> | null;
      is_seed: boolean;
    }[]
  >`
    select id, name, type, invited_at, submitted_at,
           case when submitted_at is not null then answers end as answers,
           case when submitted_at is not null then justifications end as justifications,
           is_seed
    from app.organization
    where ${opts.includeSeed} or not is_seed`;
  return sortCzech(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      invitedAt: new Date(r.invited_at).toISOString(),
      submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : null,
      answers: r.answers,
      justifications: r.justifications,
      isSeed: r.is_seed,
    })),
  );
}

/** Rate limit odeslání (pevné okno 1 h v app.rate_limit, IP jen jako HMAC s denní solí). */
export const ORG_SUBMIT_LIMIT = { limit: 10, windowSec: 3600 } as const;

export async function hitOrgLimit(sql: Db, ip: string, now = new Date()): Promise<boolean> {
  const ms = ORG_SUBMIT_LIMIT.windowSec * 1000;
  const start = new Date(Math.floor(now.getTime() / ms) * ms);
  const key = ipKey(ip, now);
  const [row] = await sql<{ count: number }[]>`
    insert into app.rate_limit (bucket, window_start, count)
    values (${`orgSubmitPerIp:${key}`}, ${start.toISOString()}, 1)
    on conflict (bucket, window_start) do update set count = app.rate_limit.count + 1
    returning count`;
  return Number(row?.count ?? 1) <= ORG_SUBMIT_LIMIT.limit;
}
