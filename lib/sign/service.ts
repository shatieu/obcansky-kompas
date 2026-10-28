import type postgres from "postgres";
import type { Answers } from "@/lib/compose/types";
import { emailHmac, encrypt, randomToken, sha256Hex } from "@/lib/crypto";
import { deleteForSignature } from "@/lib/demo/service";
import { EDIT_TTL_MS, VERIFY_TTL_MS } from "./http";
import { generateShortId } from "./short-id";

/**
 * Zápisy podpisu (SPEC §7, §14.1–§14.3). Každá operace = jedna transakce. Osobní údaje jen
 * šifrovaně (AES-256-GCM), e-mail navíc jako HMAC (unikátní), tokeny jen jako SHA-256.
 */

type Tx = postgres.TransactionSql;
const asJson = (tx: Tx, v: unknown) => tx.json(v as postgres.JSONValue);

export interface SignData {
  name: string;
  email: string;
  showName: boolean;
  address: string | null;
  answers: Answers;
  contentVersion: string;
  region: string | null;
  ageGroup: string | null;
  municipalitySize: string | null;
  comment: string | null;
}

export interface SignResult {
  signatureId: string;
  /** Krátké číslo podpisu (kanonický tvar, lib/sign/short-id.ts). */
  shortId: string;
  signerId: string;
  jobId: string;
  /** Surový ověřovací token – jen do e-mailu / na obrazovku v POC, do DB jde hash. */
  verifyToken: string;
  replaced: boolean;
}

/** Úloha se nechá na after(); cron ji vezme, až když after() do té doby neuspěje. */
const JOB_GRACE_SECONDS = 300;

async function issueToken(tx: Tx, signerId: string, purpose: "verify" | "edit", ttlMs: number): Promise<string> {
  // Jeden platný odkaz daného druhu: starší nepoužité tokeny zrušíme.
  await tx`delete from app.email_token where signer_id = ${signerId} and purpose = ${purpose} and used_at is null`;
  const token = randomToken();
  await tx`
    insert into app.email_token (signer_id, token_hash, purpose, expires_at)
    values (${signerId}, ${sha256Hex(token)}, ${purpose}, ${new Date(Date.now() + ttlMs).toISOString()})`;
  return token;
}

async function insertJob(tx: Tx, signerId: string, kind: "verify" | "edit", poc: boolean): Promise<string> {
  const [job] = poc
    ? await tx<{ id: string }[]>`
        insert into app.email_job (signer_id, kind, status, last_error)
        values (${signerId}, ${kind}, 'sent', 'poc: e-mail se v ukázkovém režimu neposílá')
        returning id`
    : await tx<{ id: string }[]>`
        insert into app.email_job (signer_id, kind, status, next_attempt_at)
        values (${signerId}, ${kind}, 'pending', now() + make_interval(secs => ${JOB_GRACE_SECONDS}))
        returning id`;
  return job!.id;
}

async function signOnce(sql: postgres.Sql, d: SignData, poc: boolean): Promise<SignResult> {
  return sql.begin(async (tx) => {
    const hmac = emailHmac(d.email);
    const [existing] = await tx<{ signer_id: string; signature_id: string; short_id: string }[]>`
      select r.id as signer_id, r.signature_id, s.short_id
      from app.signer r join app.signature s on s.id = r.signature_id
      where r.email_hmac = ${hmac} for update of r`;

    let signatureId: string;
    let signerId: string;
    let shortId: string;
    if (existing) {
      // Číslo podpisu se nemění (stejně jako UUID).
      shortId = existing.short_id;
      // Jeden e-mail = jeden aktivní podpis: nový podpis nahradí starý, historie do signature_version.
      signatureId = existing.signature_id;
      signerId = existing.signer_id;
      await tx`
        insert into app.signature_version (signature_id, answers, content_version, created_at)
        select id, answers, content_version, now() from app.signature where id = ${signatureId}`;
      await tx`
        update app.signature set
          answers = ${asJson(tx, d.answers)}, content_version = ${d.contentVersion},
          region = ${d.region}, age_group = ${d.ageGroup}, municipality_size = ${d.municipalitySize},
          comment = ${d.comment}, verification_level = 'unverified', verified_at = null,
          withdrawn_at = null, is_poc = ${poc}
        where id = ${signatureId}`;
      await tx`
        update app.signer set
          name_enc = ${encrypt(d.name)}, show_name = ${d.showName}, email_enc = ${encrypt(d.email)},
          address_enc = ${d.address ? encrypt(d.address) : null}, consent_at = now()
        where id = ${signerId}`;
    } else {
      shortId = generateShortId();
      const [sig] = await tx<{ id: string }[]>`
        insert into app.signature (answers, content_version, region, age_group, municipality_size, comment, is_poc, short_id)
        values (${asJson(tx, d.answers)}, ${d.contentVersion}, ${d.region}, ${d.ageGroup}, ${d.municipalitySize}, ${d.comment}, ${poc}, ${shortId})
        returning id`;
      signatureId = sig!.id;
      const [signer] = await tx<{ id: string }[]>`
        insert into app.signer (signature_id, name_enc, show_name, email_enc, email_hmac, address_enc, consent_at)
        values (${signatureId}, ${encrypt(d.name)}, ${d.showName}, ${encrypt(d.email)}, ${hmac},
                ${d.address ? encrypt(d.address) : null}, now())
        returning id`;
      signerId = signer!.id;
    }
    const verifyToken = await issueToken(tx, signerId, "verify", VERIFY_TTL_MS);
    const jobId = await insertJob(tx, signerId, "verify", poc);
    return { signatureId, shortId, signerId, jobId, verifyToken, replaced: Boolean(existing) };
  });
}

export async function createOrReplaceSignature(sql: postgres.Sql, d: SignData, opts: { poc: boolean }): Promise<SignResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await signOnce(sql, d, opts.poc);
    } catch (e) {
      // 23505: souběh dvou prvních podpisů se stejným e-mailem (unique email_hmac → nahradí),
      // nebo – zcela výjimečně – kolize náhodného čísla podpisu (nové číslo při dalším pokusu).
      if ((e as { code?: string }).code === "23505" && attempt < 3) continue;
      throw e;
    }
  }
}

export type TokenOutcome =
  | { status: "ok"; signatureId: string; shortId: string }
  | { status: "used"; signatureId: string; shortId: string }
  | { status: "expired" }
  | { status: "invalid" };

interface TokenRow {
  id: string;
  signer_id: string;
  signature_id: string;
  short_id: string;
  expires_at: Date;
  used_at: Date | null;
  withdrawn_at: Date | null;
}

async function lockToken(tx: Tx, token: string, purpose: "verify" | "edit"): Promise<TokenRow | undefined> {
  const [row] = await tx<TokenRow[]>`
    select t.id, t.signer_id, r.signature_id, s.short_id, t.expires_at, t.used_at, s.withdrawn_at
    from app.email_token t
    join app.signer r on r.id = t.signer_id
    join app.signature s on s.id = r.signature_id
    where t.token_hash = ${sha256Hex(token)} and t.purpose = ${purpose}
    for update of t`;
  return row;
}

/** Jednorázové ověření e-mailem (SPEC §7.2): unverified → email, verified_at. */
export async function verifySignature(sql: postgres.Sql, token: string): Promise<TokenOutcome> {
  return sql.begin(async (tx) => {
    const row = await lockToken(tx, token, "verify");
    if (!row || row.withdrawn_at) return { status: "invalid" } as const;
    if (row.used_at) return { status: "used", signatureId: row.signature_id, shortId: row.short_id } as const;
    if (new Date(row.expires_at).getTime() <= Date.now()) return { status: "expired" } as const;
    await tx`update app.email_token set used_at = now() where id = ${row.id}`;
    await tx`
      update app.signature set
        verification_level = case when verification_level = 'unverified' then 'email'::app.verification_level else verification_level end,
        verified_at = coalesce(verified_at, now())
      where id = ${row.signature_id}`;
    return { status: "ok", signatureId: row.signature_id, shortId: row.short_id } as const;
  });
}

export interface EditLinkResult {
  signerId: string;
  signatureId: string;
  jobId: string;
  editToken: string;
}

/** Odkaz pro úpravu (SPEC §7.3). null = e-mail nemá aktivní podpis (odpověď API je stejná). */
export async function requestEditLink(sql: postgres.Sql, email: string, opts: { poc: boolean }): Promise<EditLinkResult | null> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ signer_id: string; signature_id: string }[]>`
      select r.id as signer_id, r.signature_id
      from app.signer r join app.signature s on s.id = r.signature_id
      where r.email_hmac = ${emailHmac(email)} and s.withdrawn_at is null
      for update of r`;
    if (!row) return null;
    const editToken = await issueToken(tx, row.signer_id, "edit", EDIT_TTL_MS);
    const jobId = await insertJob(tx, row.signer_id, "edit", opts.poc);
    return { signerId: row.signer_id, signatureId: row.signature_id, jobId, editToken };
  });
}

export interface EditableSignature {
  signatureId: string;
  shortId: string;
  answers: Answers;
  contentVersion: string;
  region: string | null;
  ageGroup: string | null;
  municipalitySize: string | null;
  comment: string | null;
  showName: boolean;
}

/** Stav podpisu pro stránku úpravy. Token se tím nespotřebuje (spotřebuje ho až uložení/odvolání). */
export async function loadEditable(sql: postgres.Sql, token: string): Promise<EditableSignature | null> {
  const [row] = await sql<
    {
      signature_id: string;
      short_id: string;
      answers: Answers;
      content_version: string;
      region: string | null;
      age_group: string | null;
      municipality_size: string | null;
      comment: string | null;
      show_name: boolean;
    }[]
  >`
    select s.id as signature_id, s.short_id, s.answers, s.content_version, s.region, s.age_group, s.municipality_size, s.comment, r.show_name
    from app.email_token t
    join app.signer r on r.id = t.signer_id
    join app.signature s on s.id = r.signature_id
    where t.token_hash = ${sha256Hex(token)} and t.purpose = 'edit' and t.used_at is null
      and t.expires_at > now() and s.withdrawn_at is null`;
  if (!row) return null;
  return {
    signatureId: row.signature_id,
    shortId: row.short_id,
    answers: row.answers,
    contentVersion: row.content_version,
    region: row.region,
    ageGroup: row.age_group,
    municipalitySize: row.municipality_size,
    comment: row.comment,
    showName: row.show_name,
  };
}

export interface EditData {
  answers: Answers;
  contentVersion: string;
  region: string | null;
  ageGroup: string | null;
  municipalitySize: string | null;
  comment: string | null;
  showName: boolean;
}

type EditOutcome =
  | { status: "ok"; signatureId: string; demonstrator?: { id: string; index: number } | null }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "used" };

async function consumeEditToken(tx: Tx, token: string): Promise<{ row: TokenRow } | { fail: EditOutcome }> {
  const row = await lockToken(tx, token, "edit");
  if (!row || row.withdrawn_at) return { fail: { status: "invalid" } };
  if (row.used_at) return { fail: { status: "used" } };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { fail: { status: "expired" } };
  await tx`update app.email_token set used_at = now() where id = ${row.id}`;
  return { row };
}

/** Úprava odpovědí přes odkaz z e-mailu. UUID zůstává, stará verze jde do historie. */
export async function applyEdit(sql: postgres.Sql, token: string, d: EditData): Promise<EditOutcome> {
  return sql.begin(async (tx) => {
    const c = await consumeEditToken(tx, token);
    if ("fail" in c) return c.fail;
    const id = c.row.signature_id;
    await tx`
      insert into app.signature_version (signature_id, answers, content_version, created_at)
      select id, answers, content_version, now() from app.signature where id = ${id}`;
    // Odkaz přišel e-mailem → vlastnictví adresy je tím prokázané.
    await tx`
      update app.signature set
        answers = ${asJson(tx, d.answers)}, content_version = ${d.contentVersion},
        region = ${d.region}, age_group = ${d.ageGroup}, municipality_size = ${d.municipalitySize},
        comment = ${d.comment},
        verification_level = case when verification_level = 'unverified' then 'email'::app.verification_level else verification_level end,
        verified_at = coalesce(verified_at, now())
      where id = ${id}`;
    await tx`update app.signer set show_name = ${d.showName} where id = ${c.row.signer_id}`;
    return { status: "ok", signatureId: id } as const;
  });
}

/**
 * Odvolání (SPEC §7.3): smaže osobní údaje (celý řádek signer → kaskádou tokeny a fronta)
 * i komentář. Odpovědi zůstanou anonymně v agregacích, UUID zůstává.
 */
export async function withdrawSignature(sql: postgres.Sql, token: string): Promise<EditOutcome> {
  return sql.begin(async (tx) => {
    const c = await consumeEditToken(tx, token);
    if ("fail" in c) return c.fail;
    const id = c.row.signature_id;
    // owner_epoch + 1: všechny cookie ok_owner tohoto podpisu přestanou platit (lib/demo/owner.ts).
    await tx`update app.signature set withdrawn_at = now(), comment = null, owner_epoch = owner_epoch + 1 where id = ${id}`;
    await tx`delete from app.signer where id = ${c.row.signer_id}`;
    // Odvolání odstraní i panáčka z online demonstrace (SPEC-demonstrace §3); route zneplatní dlaždici.
    const demonstrator = await deleteForSignature(tx, id);
    return { status: "ok", signatureId: id, demonstrator } as const;
  });
}
