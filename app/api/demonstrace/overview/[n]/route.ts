import { CACHE_LAST_TILE, CACHE_OVERVIEW_FULL, overviewTag, TILE_SIZE } from "@/lib/demo/constants";
import { demoError, demoUnavailable } from "@/lib/demo/http";
import { TILE_N_RE } from "@/lib/demo/input";
import { loadMeta, loadOverview } from "@/lib/demo/read";

/**
 * GET /api/demonstrace/overview/[n] → application/octet-stream, 1 bajt na position_index dlaždice
 * (lib/demo/overview: obsazeno + póza + barva + tvar cedule). Pro siluety vzdáleného pohledu
 * (~1 kB na 1 000 lidí místo ~60–100 kB plné dlaždice). Bez textu → plná dlaždice drží v CDN den
 * (čistí ji tag demo-overview:<n> při připojení/úpravě/odvolání), poslední krátce.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ n: string }> }): Promise<Response> {
  const { n: raw } = await ctx.params;
  if (!TILE_N_RE.test(raw)) return demoError("not_found", 404);
  const n = Number(raw);
  try {
    const meta = await loadMeta();
    const last = n >= meta.tiles - 1;
    const bytes = n >= meta.tiles ? new Uint8Array(0) : await loadOverview(n, last);
    const full = !last && bytes.length === TILE_SIZE;
    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": full ? CACHE_OVERVIEW_FULL : CACHE_LAST_TILE,
        "vercel-cache-tag": overviewTag(n),
      },
    });
  } catch (e) {
    return demoUnavailable(e, "overview");
  }
}
