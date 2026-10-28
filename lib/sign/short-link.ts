import { headers } from "next/headers";
import { getSql, hasDatabase } from "@/lib/db/client";
import { hit, ipKey } from "@/lib/rate-limit";
import { signatureIdByShortId } from "./lookup";
import { normalizeShortId } from "./short-id";

/**
 * /v/<číslo podpisu> → cíl 308 přesměrování na /v/<uuid> (číslo funguje jako krátký odkaz).
 * Číslo (8 znaků, s pomlčkou 9) se s UUID (36 znaků) nikdy nepotká. Stejný rate limit jako
 * GET /api/signature/lookup (30/h na IP), aby šlo čísla vyčíslovat ani přes stránku.
 * null = není to číslo, neexistuje, limit, nebo DB nedostupná (stránka pak vrátí 404).
 */
export async function shortLinkTarget(param: string, rest = ""): Promise<string | null> {
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    return null;
  }
  if (decoded.length > 12) return null;
  const shortId = normalizeShortId(decoded);
  if (!shortId || !hasDatabase()) return null;
  try {
    const sql = getSql();
    const h = await headers();
    const ip = h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const r = await hit(sql, "lookupPerIp", ipKey(ip));
    if (!r.allowed) return null;
    const id = await signatureIdByShortId(sql, shortId);
    return id ? `/v/${id}${rest}` : null;
  } catch {
    console.error("[sign] short link: db unavailable");
    return null;
  }
}
