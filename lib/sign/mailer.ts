import type postgres from "postgres";
import { decrypt, randomToken, sha256Hex } from "@/lib/crypto";
import { consoleProvider, EmailError, fillTemplate, getEmailProvider, type EmailMessage, type EmailProvider } from "@/lib/email";
import { composeStatement } from "@/lib/compose";
import type { Answers } from "@/lib/compose/types";
import { flags } from "@/lib/env";
import { EDIT_TTL_MS, editUrl, verifyUrl, VERIFY_TTL_MS } from "./http";
import { formatShortId } from "./short-id";
import { signTexts } from "./texts";

/**
 * Odesílání e-mailů z fronty app.email_job (SPEC §14.2). Hned po zápisu přes after(),
 * neúspěšné úlohy dočistí GET /api/cron/email. V POC se nic neposílá (§0.3).
 */

export const MAX_ATTEMPTS = 5;
/** Odklad dalšího pokusu po `previousAttempts` neúspěších: 1, 3, 9, 27, 81 min (stejně jako SQL v markResult). */
export function backoffSeconds(previousAttempts: number): number {
  return 60 * 3 ** Math.min(Math.max(previousAttempts, 0), 4);
}

export type JobKind = "verify" | "edit";

/**
 * `statement` = prostý text k podpisu se štítky (composeStatement(...).text). Do ověřovacího
 * e-mailu jde pod nadpisem `statement_heading`; prázdný = sekce se vynechá.
 * `shortId` = číslo podpisu (XXXX-XXXX) pro načtení odpovědí na jiném zařízení; prázdné = vynechá se.
 */
export function buildMessage(kind: JobKind, to: string, url: string, statement = "", shortId = ""): EmailMessage {
  const t = signTexts().email;
  const block = statement ? `\n${t.statement_heading}\n\n${statement}\n` : "";
  const code = shortId ? `\n${fillTemplate(t.short_id_line, { code: formatShortId(shortId) })}\n` : "";
  return kind === "verify"
    ? { kind, to, subject: t.verify_subject, text: fillTemplate(t.verify_body, { url, statement: block, short_id: code }) }
    : { kind, to, subject: t.edit_subject, text: fillTemplate(t.edit_body, { url }) };
}

function mailer(): EmailProvider {
  return flags.pocMode() ? consoleProvider : getEmailProvider();
}

const errorCode = (e: unknown) => (e instanceof EmailError ? e.code : "send_failed");

async function markResult(sql: postgres.Sql, jobId: string, error: string | null): Promise<void> {
  if (error === null) {
    await sql`update app.email_job set status = 'sent', attempts = attempts + 1, last_error = null where id = ${jobId}`;
  } else {
    await sql`
      update app.email_job set
        status = 'failed', attempts = attempts + 1, last_error = ${error},
        next_attempt_at = now() + interval '1 minute' * power(3, least(attempts, 4))
      where id = ${jobId}`;
  }
}

async function recipient(sql: postgres.Sql, signerId: string): Promise<{ to: string; statement: string; shortId: string } | null> {
  const [row] = await sql<{ email_enc: string; answers: Answers; content_version: string; short_id: string }[]>`
    select r.email_enc, s.answers, s.content_version, s.short_id
    from app.signer r join app.signature s on s.id = r.signature_id
    where r.id = ${signerId}`;
  if (!row) return null;
  let statement = "";
  try {
    statement = composeStatement(row.answers, row.content_version).text;
  } catch {
    statement = ""; // neznámá verze obsahu – e-mail bez textu
  }
  return { to: decrypt(row.email_enc), statement, shortId: row.short_id };
}

/** Pošle úlohu s už vydaným tokenem (volá se z after() hned po zápisu). */
export async function deliverJob(
  sql: postgres.Sql,
  job: { id: string; signerId: string; kind: JobKind; token: string; baseUrl: string },
): Promise<boolean> {
  try {
    const r = await recipient(sql, job.signerId);
    if (!r) return false;
    const url = job.kind === "verify" ? verifyUrl(job.baseUrl, job.token) : editUrl(job.baseUrl, job.token);
    await mailer().send(buildMessage(job.kind, r.to, url, r.statement, r.shortId));
    await markResult(sql, job.id, null);
    console.info(`[email] sent kind=${job.kind}`);
    return true;
  } catch (e) {
    console.error(`[email] failed kind=${job.kind} code=${errorCode(e)}`);
    await markResult(sql, job.id, errorCode(e)).catch(() => {});
    return false;
  }
}

/**
 * Cron: vezme splatné pending/failed úlohy, vydá k nim nový token (surový token v DB není)
 * a pošle. Úlohy se nejdřív „zarezervují“ posunem next_attempt_at, aby je souběžný běh nevzal.
 */
export async function processDueJobs(sql: postgres.Sql, baseUrl: string, limit = 25): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  if (flags.pocMode()) return out;
  const jobs = await sql<{ id: string; signer_id: string; kind: JobKind; verified: boolean }[]>`
    update app.email_job j set next_attempt_at = now() + interval '10 minutes'
    from app.signer r join app.signature s on s.id = r.signature_id
    where j.signer_id = r.id and j.id in (
      select id from app.email_job
      where status in ('pending', 'failed') and next_attempt_at <= now() and attempts < ${MAX_ATTEMPTS}
      order by next_attempt_at limit ${limit}
      for update skip locked
    )
    returning j.id, j.signer_id, j.kind, (s.verification_level <> 'unverified') as verified`;
  for (const job of jobs) {
    if (job.kind === "verify" && job.verified) {
      await sql`update app.email_job set status = 'sent', last_error = 'already_verified' where id = ${job.id}`;
      out.skipped++;
      continue;
    }
    const token = randomToken();
    await sql.begin(async (tx) => {
      await tx`delete from app.email_token where signer_id = ${job.signer_id} and purpose = ${job.kind} and used_at is null`;
      await tx`
        insert into app.email_token (signer_id, token_hash, purpose, expires_at)
        values (${job.signer_id}, ${sha256Hex(token)}, ${job.kind},
                ${new Date(Date.now() + (job.kind === "verify" ? VERIFY_TTL_MS : EDIT_TTL_MS)).toISOString()})`;
    });
    const ok = await deliverJob(sql, { id: job.id, signerId: job.signer_id, kind: job.kind, token, baseUrl });
    if (ok) out.sent++;
    else out.failed++;
  }
  return out;
}

/** Hlášení komentáře – e-mail spolku (REPORT_EMAIL_TO). Bez fronty: nemá signer_id. */
export async function sendReport(r: { signatureId: string; pageUrl: string; reason: string; contact: string | null }): Promise<void> {
  const t = signTexts().email;
  // TODO(owner): adresa spolku pro hlášení (REPORT_EMAIL_TO).
  const to = process.env.REPORT_EMAIL_TO;
  const msg: EmailMessage = {
    kind: "report",
    to: to || "spolek@example.invalid",
    subject: fillTemplate(t.report_subject, { uuid: r.signatureId }),
    text: fillTemplate(t.report_body, { url: r.pageUrl, reason: r.reason, contact: r.contact ?? "–" }),
    ...(r.contact && r.contact.includes("@") ? { replyTo: r.contact } : {}),
  };
  const provider = !to ? consoleProvider : mailer();
  try {
    await provider.send(msg);
    console.info(`[email] sent kind=report provider=${provider.name}`);
  } catch (e) {
    console.error(`[email] failed kind=report code=${errorCode(e)}`);
  }
}
