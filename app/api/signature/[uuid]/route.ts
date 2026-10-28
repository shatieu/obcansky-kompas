import { hasDatabase } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { getSignatureAnswers } from "@/lib/share/data";
import { getPublicSignature } from "@/lib/sign/read";
import { UUID_RE } from "@/lib/sign/input";

/**
 * GET /api/signature/[uuid] – jen { answers, content_version, name } neodvolaného podpisu
 * (předvyplnění /akce a /v/[uuid]/zakon v prohlížeči). `name` jen když ho podepsaný zveřejnil
 * (show_name – stejné jméno ukazuje veřejná stránka /v/[uuid]), jinak null; /akce ho dá pod
 * dopis. Žádné další osobní údaje (e-mail, adresa, komentář, kraj). Data z cache s tagem `sig:<uuid>`, která se zneplatní při úpravě
 * a odvolání; prohlížeč a CDN necachují, aby se odvolání projevilo hned.
 */
export const dynamic = "force-dynamic";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export async function GET(_req: Request, ctx: { params: Promise<{ uuid: string }> }): Promise<Response> {
  const { uuid } = await ctx.params;
  if (!UUID_RE.test(uuid)) return json({ error: "not_found" }, 404);
  if (!hasDatabase() || flags.staticDemo()) return json({ error: "unavailable" }, 503);
  try {
    const row = await getSignatureAnswers(uuid);
    if (!row) return json({ error: "not_found" }, 404);
    const pub = await getPublicSignature(uuid.toLowerCase()).catch(() => null);
    const name = pub && !pub.withdrawn ? pub.name : null;
    return json({ answers: row.answers, content_version: row.content_version, name });
  } catch {
    console.error("[signature] GET: db unavailable");
    return json({ error: "unavailable" }, 503);
  }
}
