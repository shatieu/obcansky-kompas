import { getSql } from "@/lib/db/client";
import { cronAuthorized, demoJson } from "@/lib/demo/http";
import { processModerationJobs } from "@/lib/demo/moderation";
import { pruneReports } from "@/lib/demo/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/moderation (SPEC-demonstrace §4.2, §4.3): dočistí frontu AI moderace (hlavní cesta
 * je after() hned po zápisu) a smaže nahlášení starší 7 dní (HMAC IP, SPEC §14.3). Chráněno
 * `Authorization: Bearer CRON_SECRET` (Vercel Cron). Vercel Hobby = jen denní běh.
 */
export async function GET(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return demoJson({ ok: false, error: "unauthorized" }, 401);
  try {
    const moderation = await processModerationJobs({ limit: 50 });
    const prunedReports = await pruneReports(getSql());
    console.info(`[cron:moderation] ${JSON.stringify(moderation)} reports=${prunedReports}`);
    return demoJson({ ok: true, moderation, prunedReports });
  } catch (e) {
    console.error(`[cron:moderation] failed code=${String((e as { code?: string }).code ?? "unknown").slice(0, 40)}`);
    return demoJson({ ok: false, error: "unavailable" }, 503);
  }
}
