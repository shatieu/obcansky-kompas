/**
 * Krátké číslo podpisu (požadavek vlastníka 2026-10-28): 8 znaků z Crockford base32 bez
 * I, L, O, U (nedají se splést), zobrazení `XXXX-XXXX`. Náhodné (crypto), ~40 bitů – v DB
 * `app.signature.short_id` (unikátní), uložené bez pomlčky velkými písmeny.
 *
 * Bez importů z Node – sdílí ho server (generování, vyhledání) i prohlížeč (načtení odpovědí).
 */
export const SHORT_ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SHORT_ID_LENGTH = 8;
export const SHORT_ID_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** Nové náhodné číslo (kanonický tvar bez pomlčky). 256 % 32 = 0, takže bez zkreslení. */
export function generateShortId(): string {
  const bytes = new Uint8Array(SHORT_ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += SHORT_ID_ALPHABET[b & 31];
  return out;
}

/** `ABCD1234` → `ABCD-1234` (pro lidi). Neplatný vstup vrátí beze změny. */
export function formatShortId(id: string): string {
  const n = normalizeShortId(id);
  return n ? `${n.slice(0, 4)}-${n.slice(4)}` : id;
}

/**
 * Vstup od člověka → kanonický tvar, nebo null. Pomlčky a mezery se ignorují, velikost písmen
 * taky; jako v Crockford base32 se O čte jako 0 a I/L jako 1 (přepis z papíru, z e-mailu).
 */
export function normalizeShortId(input: string): string | null {
  const s = input
    .replace(/[\s\-‐-―_.]/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return SHORT_ID_RE.test(s) ? s : null;
}

const UUID_PART = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_ONLY = new RegExp(`^${UUID_PART}$`);
const TOKEN_PART = "[A-Za-z0-9_-]{32,128}";

export type LookupCode =
  | { kind: "short"; shortId: string }
  | { kind: "uuid"; uuid: string }
  | { kind: "verify"; token: string }
  | { kind: "edit"; token: string };

/**
 * Co člověk vložil do „Načíst moje odpovědi“: číslo podpisu (s pomlčkou i bez), UUID, nebo celý
 * odkaz – `/v/<uuid>[/...]`, `/v/<číslo>`, `/overeni/<token>`, `/kompas/podpis/uprava/<token>`
 * (s doménou i bez, s `?query` / `#hash`). Nic jiného → null.
 */
export function parseLookupCode(input: string): LookupCode | null {
  const raw = input.trim();
  if (!raw || raw.length > 600) return null;
  if (UUID_ONLY.test(raw)) return { kind: "uuid", uuid: raw.toLowerCase() };
  const short = normalizeShortId(raw);
  if (short && raw.length <= 12) return { kind: "short", shortId: short };

  // Odkaz: vezmeme jen cestu (doména, query a hash nehrají roli).
  let path = raw;
  const scheme = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(path);
  if (scheme) path = path.slice(scheme[0].length);
  else if (!path.startsWith("/")) {
    // „obcanskykompas.cz/v/…“ bez schématu
    const slash = path.indexOf("/");
    if (slash < 0) return null;
    path = path.slice(slash);
  }
  path = path.split(/[?#]/)[0]!;
  let m = new RegExp(`^/v/(${UUID_PART})(?:/.*)?$`).exec(path);
  if (m) return { kind: "uuid", uuid: m[1]!.toLowerCase() };
  m = /^\/v\/([^/]{8,12})\/?$/.exec(path);
  if (m) {
    const s = normalizeShortId(decodeURIComponentSafe(m[1]!));
    return s ? { kind: "short", shortId: s } : null;
  }
  m = new RegExp(`^/overeni/(${TOKEN_PART})/?$`).exec(path);
  if (m) return { kind: "verify", token: m[1]! };
  m = new RegExp(`^/kompas/podpis/uprava/(${TOKEN_PART})/?$`).exec(path);
  if (m) return { kind: "edit", token: m[1]! };
  return null;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
