import { CACHE_FULL_TILE, CACHE_LAST_TILE, publicTileItem, TILE_SIZE, tileTag, type PublicTileResponse } from "@/lib/demo/constants";
import { demoError, demoJson, demoUnavailable } from "@/lib/demo/http";
import { TILE_N_RE } from "@/lib/demo/input";
import { loadMeta, loadTile } from "@/lib/demo/read";

/**
 * GET /api/demonstrace/tile/[n] → { n, items: [index, seed, pose, signColor, slogan, name, joinedDay][] }
 * (SPEC-demonstrace §6.4). Jen schválené a neskryté vlastní texty a jména.
 * Delší CDN platnost jen pro dlaždici, která má právě 1 000 řádků: index ze sekvence se přidělí
 * dřív, než se transakce potvrdí, takže dlaždice pod nejvyšším indexem může ještě dostat
 * nižší index (a dlaždice s mezerami po odvolání se nikdy nezaplní) – ty mají krátkou platnost.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ n: string }> }): Promise<Response> {
  const { n: raw } = await ctx.params;
  if (!TILE_N_RE.test(raw)) return demoError("not_found", 404);
  const n = Number(raw);
  try {
    const meta = await loadMeta();
    const last = n >= meta.tiles - 1;
    const tile = n >= meta.tiles ? { n, items: [] } : await loadTile(n, last);
    const full = !last && tile.items.length === TILE_SIZE;
    // Bez id (uuid) – ~40 % menší; kartu dotáhne GET /api/demonstrace/at/[index].
    const body: PublicTileResponse = { n: tile.n, items: tile.items.map(publicTileItem) };
    return demoJson(body, 200, { "cache-control": full ? CACHE_FULL_TILE : CACHE_LAST_TILE, "vercel-cache-tag": tileTag(n) });
  } catch (e) {
    return demoUnavailable(e, "tile");
  }
}
