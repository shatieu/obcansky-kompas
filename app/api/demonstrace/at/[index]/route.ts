import { CACHE_PERSON, personTag, tileOf, tileTag } from "@/lib/demo/constants";
import { demoError, demoJson, demoUnavailable } from "@/lib/demo/http";
import { loadPersonAt } from "@/lib/demo/read";

const INDEX_RE = /^(0|[1-9]\d{0,8})$/;

/**
 * GET /api/demonstrace/at/[index] → stejná veřejná data jako GET /api/demonstrace/[id] (s id),
 * podle position_index. Dlaždice API id nenesou; karta po klepnutí si ho vezme tady.
 * Data z cache dlaždice; CDN tagy demo-tile:<n> (změna kohokoli v dlaždici) a demo-person:<id>.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ index: string }> }): Promise<Response> {
  const { index: raw } = await ctx.params;
  if (!INDEX_RE.test(raw)) return demoError("not_found", 404);
  const index = Number(raw);
  try {
    const person = await loadPersonAt(index);
    if (!person) return demoError("not_found", 404);
    return demoJson(person, 200, { "cache-control": CACHE_PERSON, "vercel-cache-tag": `${tileTag(tileOf(index))},${personTag(person.id)}` });
  } catch (e) {
    return demoUnavailable(e, "person_at");
  }
}
