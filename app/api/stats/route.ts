import { NextResponse, type NextRequest } from "next/server";
import { parseFilters } from "@/lib/stats/filters";
import { getStats, STATS_CACHE_CONTROL } from "@/lib/stats/source";

/**
 * GET /api/stats?kraj=&vek=&obec= – agregace jedním SQL dotazem, cache na CDN 60 s
 * (SPEC §14.2). STATIC_DEMO=1 čte statický snímek seedu.
 */
export async function GET(req: NextRequest) {
  const stats = await getStats(parseFilters(req.nextUrl.searchParams));
  if (!stats) {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(stats, { headers: { "Cache-Control": STATS_CACHE_CONTROL } });
}
