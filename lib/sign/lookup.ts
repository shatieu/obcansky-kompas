import type postgres from "postgres";
import type { Answers } from "@/lib/compose/types";
import { sha256Hex } from "@/lib/crypto";
import type { LookupCode } from "./short-id";

/**
 * Načtení odpovědí podpisu na jiném zařízení (požadavek vlastníka 2026-10-28): podle čísla
 * podpisu, UUID nebo odkazu z e-mailu. Vrací jen veřejná data, která ukazuje i /v/<uuid>
 * (odpovědi + verze obsahu) – nikdy jméno, e-mail, adresu, komentář ani demografii.
 * Jen neodvolané podpisy. Token z odkazu se jen najde podle hashe – NEspotřebuje se
 * (ani verify, ani edit), nezáleží na platnosti ani použití: jde jen o čtení veřejných dat.
 */
export interface LookupResult {
  uuid: string;
  shortId: string;
  answers: Answers;
  contentVersion: string;
}

type Row = { id: string; short_id: string; answers: Answers; content_version: string };

export async function lookupSignatureByCode(sql: postgres.Sql, code: LookupCode): Promise<LookupResult | null> {
  let rows: Row[];
  switch (code.kind) {
    case "short":
      rows = await sql<Row[]>`
        select id, short_id, answers, content_version from app.signature
        where short_id = ${code.shortId} and withdrawn_at is null`;
      break;
    case "uuid":
      rows = await sql<Row[]>`
        select id, short_id, answers, content_version from app.signature
        where id = ${code.uuid} and withdrawn_at is null`;
      break;
    case "verify":
    case "edit":
      rows = await sql<Row[]>`
        select s.id, s.short_id, s.answers, s.content_version
        from app.email_token t
        join app.signer r on r.id = t.signer_id
        join app.signature s on s.id = r.signature_id
        where t.token_hash = ${sha256Hex(code.token)} and t.purpose = ${code.kind} and s.withdrawn_at is null`;
      break;
  }
  const row = rows[0];
  if (!row || !row.answers || typeof row.answers !== "object") return null;
  return { uuid: row.id, shortId: row.short_id, answers: row.answers, contentVersion: row.content_version };
}

/** UUID podpisu podle čísla (i odvolaného) – pro přesměrování /v/<číslo> → /v/<uuid>. */
export async function signatureIdByShortId(sql: postgres.Sql, shortId: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`select id from app.signature where short_id = ${shortId}`;
  return row?.id ?? null;
}
