import { DEMO_TAG_RE, revalidateDemoTags } from "@/lib/demo/cache";
import { cronAuthorized, demoJson } from "@/lib/demo/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/demonstrace/revalidate { tags: string[] } – zneplatnění cache davu z CLI
 * (pnpm demo:hide / demo:unhide / demo:ban-text běží mimo Next). Chráněno
 * `Authorization: Bearer CRON_SECRET`; povolené jen tagy davu (demo-tile:<n>, demo-person:<id>, demo-meta).
 */
export async function POST(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return demoJson({ ok: false, error: "unauthorized" }, 401);
  let tags: string[] = [];
  try {
    const body = (await req.json()) as { tags?: unknown };
    if (Array.isArray(body.tags))
      tags = body.tags.filter((t): t is string => typeof t === "string" && DEMO_TAG_RE.test(t)).slice(0, 100);
  } catch {
    /* prázdné tělo */
  }
  if (!tags.length) return demoJson({ ok: false, error: "invalid" }, 400);
  await revalidateDemoTags(tags);
  return demoJson({ ok: true, tags });
}
