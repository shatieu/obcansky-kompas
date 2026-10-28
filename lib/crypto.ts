import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Šifrování osobních údajů (SPEC §14.3): AES-256-GCM klíčem `PII_ENCRYPTION_KEY`,
 * deduplikace e-mailu přes HMAC-SHA256 (`HMAC_KEY`), tokeny jen jako SHA-256.
 *
 * Mimo produkci (NODE_ENV !== "production") se při chybějícím klíči použije pevný
 * vývojový klíč, aby `pnpm dev` a `pnpm seed` běžely bez konfigurace. V produkci
 * chybějící klíč = chyba.
 */

const FORMAT = "v1";

function devFallback(name: string): Buffer {
  return createHash("sha256").update(`obcansky-kompas:dev-only:${name}`).digest();
}

let warned = false;

function loadKey(name: "PII_ENCRYPTION_KEY" | "HMAC_KEY"): Buffer {
  const raw = process.env[name];
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error(`${name} musí být 32 bajtů v base64`);
    return key;
  }
  if (process.env.NODE_ENV === "production") throw new Error(`${name} chybí (produkce)`);
  if (!warned) {
    warned = true;
    console.warn(`[crypto] ${name} není nastavený – používám vývojový klíč (jen mimo produkci).`);
  }
  return devFallback(name);
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey("PII_ENCRYPTION_KEY"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [format, iv, tag, ct] = payload.split(":");
  if (format !== FORMAT || !iv || !tag || ct === undefined) throw new Error("Neznámý formát šifrovaných dat");
  const decipher = createDecipheriv("aes-256-gcm", loadKey("PII_ENCRYPTION_KEY"), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hmac(value: string): string {
  return createHmac("sha256", loadKey("HMAC_KEY")).update(value, "utf8").digest("hex");
}

export function emailHmac(email: string): string {
  return hmac(`email:${normalizeEmail(email)}`);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Náhodný token do URL (base64url, 32 B). V DB se ukládá jen sha256Hex(token). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}
