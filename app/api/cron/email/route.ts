import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSql } from "@/lib/db/client";
import { pruneRateLimits } from "@/lib/rate-limit";
import { json, siteUrl } from "@/lib/sign/http";
import { processDueJobs } from "@/lib/sign/mailer";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/cron/email (SPEC §14.2): dočistí neodeslané/neúspěšné e-maily z fronty a smaže
 * staré záznamy rate limitu (IP HMAC max. 7 dní, §14.3). Chráněno `Authorization: Bearer CRON_SECRET`
 * (tak to posílá Vercel Cron).
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (!authorized(req)) return json({ ok: false, error: "unauthorized" }, 401);
  try {
    const sql = getSql();
    const jobs = await processDueJobs(sql, siteUrl(req));
    const pruned = await pruneRateLimits(sql);
    console.info(`[cron:email] sent=${jobs.sent} failed=${jobs.failed} skipped=${jobs.skipped} pruned=${pruned}`);
    return json({ ok: true, ...jobs, pruned });
  } catch (e) {
    console.error(`[cron:email] failed code=${String((e as { code?: string }).code ?? "unknown").slice(0, 40)}`);
    return json({ ok: false, error: "unavailable" }, 503);
  }
}
