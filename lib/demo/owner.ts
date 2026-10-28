import { timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import type postgres from "postgres";
import { hmac } from "@/lib/crypto";
import { getSql } from "@/lib/db/client";
import { UUID_RE } from "@/lib/sign/input";

/**
 * Doklad vlastnictví pro online demonstraci. Odkaz /v/[uuid] je veřejný, takže připojení a úprava
 * panáčka potřebují tajemství: podepsanou httpOnly cookie `ok_owner` (HMAC klíčem HMAC_KEY,
 * obsah = id podpisu + epocha vlastníka + expirace 1 rok). Nastaví se po úspěšném ověření e-mailu
 * (/api/sign/verify), po uložení úpravy odkazem z e-mailu (/api/sign/edit) a přes
 * POST /api/demonstrace/owner { token } s platným (nespotřebovaným) odkazem pro úpravu. Žádné
 * osobní údaje, jen UUID podpisu.
 *
 * Epocha (`app.signature.owner_epoch`, bezpečnostní review): cookie nese epochu platnou při
 * vydání a při každém použití se porovná s DB. Odvolání podpisu a odhlášení (DELETE
 * /api/demonstrace/owner) epochu zvýší → všechny dříve vydané cookie (i na jiných zařízeních)
 * přestanou platit. Starší cookie bez epochy (formát v1) platí jako epocha 0.
 */
export const OWNER_COOKIE = "ok_owner";
export const OWNER_TTL_SEC = 365 * 24 * 3600;

const macV1 = (payload: string) => hmac(`owner-cookie:v1:${payload}`);
const macV2 = (payload: string) => hmac(`owner-cookie:v2:${payload}`);

export interface OwnerClaim {
  signatureId: string;
  epoch: number;
}

export function signOwnerValue(signatureId: string, epoch = 0, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + OWNER_TTL_SEC;
  const payload = `${signatureId.toLowerCase()}.${Math.max(0, Math.trunc(epoch))}.${exp}`;
  return `${payload}.${macV2(payload)}`;
}

function macOk(expectedHex: string, gotHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const got = Buffer.from(gotHex, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/**
 * Ověří podpis a expiraci cookie (bez DB); vrátí id podpisu a epochu, nebo null (podvržená,
 * poškozená, prošlá). Platnost epochy ověřuje až getOwnerSignatureId.
 */
export function parseOwnerValue(value: string | undefined | null, nowMs = Date.now()): OwnerClaim | null {
  if (!value || value.length > 200) return null;
  const parts = value.split(".");
  let id: string, epochRaw: string, expRaw: string, sig: string, ok: boolean;
  if (parts.length === 4) {
    [id, epochRaw, expRaw, sig] = parts as [string, string, string, string];
    if (!/^\d{1,9}$/.test(epochRaw)) return null;
  } else if (parts.length === 3) {
    [id, expRaw, sig] = parts as [string, string, string];
    epochRaw = "0";
  } else return null;
  if (!UUID_RE.test(id) || !/^\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  if (parts.length === 4) ok = macOk(macV2(`${id}.${epochRaw}.${expRaw}`), sig);
  else ok = macOk(macV1(`${id}.${expRaw}`), sig);
  if (!ok) return null;
  if (Number(expRaw) * 1000 <= nowMs) return null;
  return { signatureId: id, epoch: Number(epochRaw) };
}

/** Id podpisu z cookie jen podle podpisu a expirace (bez kontroly epochy) – testy a diagnostika. */
export function verifyOwnerValue(value: string | undefined | null, nowMs = Date.now()): string | null {
  return parseOwnerValue(value, nowMs)?.signatureId ?? null;
}

type CookieSource =
  | { cookies: { get(name: string): { value: string } | undefined } }
  | { get(name: string): { value: string } | undefined };

/** Nárok z cookie požadavku (NextRequest) nebo z `await cookies()` – bez DB. */
export function getOwnerClaim(src: CookieSource): OwnerClaim | null {
  const jar = "cookies" in src ? src.cookies : src;
  return parseOwnerValue(jar.get(OWNER_COOKIE)?.value);
}

/**
 * Id podpisu vlastníka z požadavku – jen když epocha v cookie odpovídá DB a podpis není odvolaný.
 * Chyba DB se propaguje (volající ji ošetří jako nedostupnost).
 */
export async function getOwnerSignatureId(src: CookieSource, sql: postgres.Sql = getSql()): Promise<string | null> {
  const claim = getOwnerClaim(src);
  if (!claim) return null;
  const [row] = await sql<{ ok: number }[]>`
    select 1 as ok from app.signature
    where id = ${claim.signatureId} and owner_epoch = ${claim.epoch} and withdrawn_at is null`;
  return row ? claim.signatureId : null;
}

/** Aktuální epocha vlastníka (pro vydání cookie). Neexistující podpis → 0. */
export async function ownerEpoch(sql: postgres.Sql, signatureId: string): Promise<number> {
  const [row] = await sql<{ owner_epoch: number }[]>`select owner_epoch from app.signature where id = ${signatureId}`;
  return row?.owner_epoch ?? 0;
}

/** Zneplatní všechny vydané cookie podpisu (odvolání, odhlášení). `tx` může být transakce. */
export async function bumpOwnerEpoch(sql: postgres.Sql | postgres.TransactionSql, signatureId: string): Promise<void> {
  await sql`update app.signature set owner_epoch = owner_epoch + 1 where id = ${signatureId}`;
}

/** Secure všude kromě čistého http (lokální vývoj na http://localhost). */
export function isSecureRequest(req?: { nextUrl?: { protocol: string }; url?: string }): boolean {
  const proto = req?.nextUrl?.protocol ?? (req?.url ? new URL(req.url).protocol : "https:");
  return proto !== "http:";
}

export function setOwnerCookie(res: NextResponse, signatureId: string, secure = true, epoch = 0): NextResponse {
  res.cookies.set(OWNER_COOKIE, signOwnerValue(signatureId, epoch), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: OWNER_TTL_SEC,
  });
  return res;
}

export function clearOwnerCookie(res: NextResponse, secure = true): NextResponse {
  res.cookies.set(OWNER_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
