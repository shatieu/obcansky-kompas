import { CACHE_META, META_TAG } from "@/lib/demo/constants";
import { demoJson, demoUnavailable } from "@/lib/demo/http";
import { loadMeta } from "@/lib/demo/read";

/** GET /api/demonstrace/meta → { count, tiles, tileSize, demo } (SPEC-demonstrace §6.4), s-maxage=30. */
export async function GET(): Promise<Response> {
  try {
    return demoJson(await loadMeta(), 200, { "cache-control": CACHE_META, "vercel-cache-tag": META_TAG });
  } catch (e) {
    return demoUnavailable(e, "meta");
  }
}
