import type { NextRequest } from "next/server";
import { getSql, hasDatabase } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { hit, ipKey } from "@/lib/rate-limit";
import { clientIp, logEvent } from "@/lib/sign/http";
import { lookupSignatureByCode } from "@/lib/sign/lookup";
import { parseLookupCode } from "@/lib/sign/short-id";

/**
 * GET /api/signature/lookup?code=… – „Načíst moje odpovědi“ na jiném zařízení. `code` = číslo
 * podpisu (XXXX-XXXX, s pomlčkou i bez, velikost písmen nehraje roli), UUID, nebo odkaz
 * /v/<uuid>[/…], /v/<číslo>, /overeni/<token>, /kompas/podpis/uprava/<token>.
 *
 * → 200 { uuid, short_id, answers, content_version } jen pro neodvolaný podpis. Jen data, která
 * ukazuje i veřejná /v/<uuid>; žádné osobní údaje ani demografie. Token z odkazu se nespotřebuje.
 * Nedává žádná práva k úpravě (cookie vlastníka se nenastavuje). Rate limit 30/h na IP.
 */
export const dynamic = "force-dynamic";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export async function GET(req: NextRequest): Promise<Response> {
  if (!hasDatabase() || flags.staticDemo()) return json({ error: "unavailable" }, 503);
  const raw = req.nextUrl.searchParams.get("code") ?? "";
  if (!raw.trim()) return json({ error: "invalid" }, 400);

  let sql;
  try {
    sql = getSql();
    // Počítá se každý pokus (i nesmyslný vstup), aby výčet čísel nešel obejít.
    const r = await hit(sql, "lookupPerIp", ipKey(clientIp(req)));
    if (!r.allowed) {
      logEvent("lookup_rate_limited");
      return json({ error: "rate_limited" }, 429);
    }
  } catch {
    console.error("[signature] lookup: db unavailable");
    return json({ error: "unavailable" }, 503);
  }

  const code = parseLookupCode(raw);
  if (!code) return json({ error: "invalid" }, 400);
  try {
    const found = await lookupSignatureByCode(sql, code);
    logEvent("lookup", { kind: code.kind, found: Boolean(found) });
    if (!found) return json({ error: "not_found" }, 404);
    return json({ uuid: found.uuid, short_id: found.shortId, answers: found.answers, content_version: found.contentVersion });
  } catch {
    console.error("[signature] lookup: db unavailable");
    return json({ error: "unavailable" }, 503);
  }
}
