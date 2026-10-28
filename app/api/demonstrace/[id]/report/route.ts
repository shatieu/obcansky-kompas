import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { hit, ipKey } from "@/lib/rate-limit";
import { revalidateDemo } from "@/lib/demo/cache";
import { demoError, demoJson, demoLog, demoUnavailable, demoWriteGate, DEMO_TEXTS, reportIpHmac } from "@/lib/demo/http";
import { reportDemonstrator } from "@/lib/demo/service";
import { clientIp } from "@/lib/sign/http";
import { UUID_RE } from "@/lib/sign/input";

export const dynamic = "force-dynamic";

/**
 * POST /api/demonstrace/[id]/report – „Nahlásit“ (SPEC-demonstrace §4.3). Max. 1 na IP a panáčka.
 * Po 3 různých IP se vlastní text a jméno skryjí (hidden_at) a dlaždice se zneplatní.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const gate = demoWriteGate();
  if (gate) return gate;
  const { id: rawId } = await ctx.params;
  if (!UUID_RE.test(rawId)) return demoError("not_found", 404);
  const id = rawId.toLowerCase();
  const ip = clientIp(req);
  try {
    const sql = getSql();
    const limited = await hit(sql, "demoReportPerIp", ipKey(ip));
    if (!limited.allowed) return demoError("rate_limited", 429);
    const r = await reportDemonstrator(sql, id, reportIpHmac(id, ip));
    demoLog("report", { status: r.status, hidden: r.status === "ok" && r.newlyHidden });
    if (r.status === "not_found") return demoError("not_found", 404);
    if (r.status === "ok" && r.newlyHidden) revalidateDemo({ index: r.index, id });
    return demoJson({ ok: true, message: DEMO_TEXTS.reported }, 202);
  } catch (e) {
    return demoUnavailable(e, "report");
  }
}
