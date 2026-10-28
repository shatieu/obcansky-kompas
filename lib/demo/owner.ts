import { timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { hmac } from "@/lib/crypto";
import { UUID_RE } from "@/lib/sign/input";

/**
 * Doklad vlastnictví pro online demonstraci. Odkaz /v/[uuid] je veřejný, takže připojení a úprava
 * panáčka potřebují tajemství: podepsanou httpOnly cookie `ok_owner` (HMAC klíčem HMAC_KEY,
 * obsah = id podpisu + expirace 1 rok). Nastaví se po úspěšném ověření e-mailu (/api/sign/verify),
 * po uložení úpravy odkazem z e-mailu (/api/sign/edit) a přes POST /api/demonstrace/owner { token }
 * s platným (nespotřebovaným) odkazem pro úpravu. Žádné osobní údaje, jen UUID podpisu.
 */
export const OWNER_COOKIE = "ok_owner";
export const OWNER_TTL_SEC = 365 * 24 * 3600;

const mac = (payload: string) => hmac(`owner-cookie:v1:${payload}`);

export function signOwnerValue(signatureId: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + OWNER_TTL_SEC;
  const payload = `${signatureId.toLowerCase()}.${exp}`;
  return `${payload}.${mac(payload)}`;
}

/** Ověří hodnotu cookie; vrátí id podpisu, nebo null (podvržená, poškozená, prošlá). */
export function verifyOwnerValue(value: string | undefined | null, nowMs = Date.now()): string | null {
  if (!value || value.length > 200) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [id, expRaw, sig] = parts as [string, string, string];
  if (!UUID_RE.test(id) || !/^\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  const expected = Buffer.from(mac(`${id}.${expRaw}`), "hex");
  const got = Buffer.from(sig, "hex");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  if (Number(expRaw) * 1000 <= nowMs) return null;
  return id;
}

type CookieSource =
  | { cookies: { get(name: string): { value: string } | undefined } }
  | { get(name: string): { value: string } | undefined };

/** Id podpisu vlastníka z požadavku (NextRequest) nebo z `await cookies()`. */
export function getOwnerSignatureId(src: CookieSource): string | null {
  const jar = "cookies" in src ? src.cookies : src;
  return verifyOwnerValue(jar.get(OWNER_COOKIE)?.value);
}

/** Secure všude kromě čistého http (lokální vývoj na http://localhost). */
export function isSecureRequest(req?: { nextUrl?: { protocol: string }; url?: string }): boolean {
  const proto = req?.nextUrl?.protocol ?? (req?.url ? new URL(req.url).protocol : "https:");
  return proto !== "http:";
}

export function setOwnerCookie(res: NextResponse, signatureId: string, secure = true): NextResponse {
  res.cookies.set(OWNER_COOKIE, signOwnerValue(signatureId), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: OWNER_TTL_SEC,
  });
  return res;
}
