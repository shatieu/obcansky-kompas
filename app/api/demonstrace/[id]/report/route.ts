import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { hit, ipKey } from "@/lib/rate-limit";
import { revalidateDemo } from "@/lib/demo/cache";
import { demoError, demoJson, demoLog, demoUnavailable, demoWriteGate, DEMO_TEXTS, ipNetworkKey, reportIpHmac } from "@/lib/demo/http";
import { reportDemonstrator } from "@/lib/demo/service";
import { clientIp, readJson } from "@/lib/sign/http";
import { UUID_RE } from "@/lib/sign/input";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/**
 * POST /api/demonstrace/[id]/report { turnstileToken } – „Nahlásit“ (SPEC-demonstrace §4.3).
 * Bezpečnostní review: povinný Turnstile token; „jedna IP“ = jedna síť (IPv4 adresa, IPv6 /64) pro
 * unikátnost nahlášení i rate limit; po 3 různých sítích se vlastní text a jméno skryjí (hidden_at),
 * nejvýš AUTO_HIDE_PER_HOUR za hodinu napříč davem – nad stropem se nahlášení zapíše a čeká na CLI.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const gate = demoWriteGate();
  if (gate) return gate;
  const { id: rawId } = await ctx.params;
  if (!UUID_RE.test(rawId)) return demoError("not_found", 404);
  const id = rawId.toLowerCase();
  const body = await readJson(req);
  const ts = await verifyTurnstile(body?.turnstileToken ?? body?.["cf-turnstile-response"]);
  if (!ts.ok) return demoError("turnstile", 400);
  const ip = clientIp(req);
  try {
    const sql = getSql();
    const limited = await hit(sql, "demoReportPerIp", ipKey(ipNetworkKey(ip)));
    if (!limited.allowed) return demoError("rate_limited", 429);
    const r = await reportDemonstrator(sql, id, reportIpHmac(id, ip));
    const deferred = r.status === "ok" && r.deferred;
    demoLog("report", { status: r.status, hidden: r.status === "ok" && r.newlyHidden, deferred });
    // Strop automatických skrytí dosažen: viditelné v logu (Vercel), ruční kontrola přes demo:reported.
    if (deferred) console.warn("[demo] report auto-hide cap reached – waiting for CLI review (pnpm demo:reported)");
    if (r.status === "not_found") return demoError("not_found", 404);
    if (r.status === "ok" && r.newlyHidden) await revalidateDemo({ index: r.index, id });
    return demoJson({ ok: true, message: DEMO_TEXTS.reported }, 202);
  } catch (e) {
    return demoUnavailable(e, "report");
  }
}
