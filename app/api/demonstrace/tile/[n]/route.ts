import { CACHE_FULL_TILE, CACHE_LAST_TILE, tileTag } from "@/lib/demo/constants";
import { demoError, demoJson, demoUnavailable } from "@/lib/demo/http";
import { TILE_N_RE } from "@/lib/demo/input";
import { loadMeta, loadTile } from "@/lib/demo/read";

/**
 * GET /api/demonstrace/tile/[n] → { n, items: [index, seed, pose, signColor, slogan, name, id, joinedDay][] }
 * (SPEC-demonstrace §6.4). Jen schválené a neskryté vlastní texty a jména. Plné dlaždice
 * s-maxage=86400 (zneplatnění tagem demo-tile:<n>), poslední rostoucí s-maxage=30.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ n: string }> }): Promise<Response> {
  const { n: raw } = await ctx.params;
  if (!TILE_N_RE.test(raw)) return demoError("not_found", 404);
  const n = Number(raw);
  try {
    const meta = await loadMeta();
    const last = n >= meta.tiles - 1;
    const tile = n >= meta.tiles ? { n, items: [] } : await loadTile(n, last);
    return demoJson(tile, 200, { "cache-control": last ? CACHE_LAST_TILE : CACHE_FULL_TILE, "vercel-cache-tag": tileTag(n) });
  } catch (e) {
    return demoUnavailable(e, "tile");
  }
}
