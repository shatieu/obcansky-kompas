import type { NextRequest } from "next/server";
import { questionsFile } from "@/lib/content";
import { dopisyCard, fotkaCard, podpisCard, srovnaniCard, zakonCard, type ShareCard } from "@/lib/share/card";
import { comparisonFor, getCachedOrganizations, getCachedStats, lookupSignature } from "@/lib/share/data";
import { isMoment, parseRecipients } from "@/lib/share/moments";
import { renderOg } from "@/lib/share/og";
import { demonstraceShareCard } from "@/lib/share/demonstrace-data";
import { shareTexts } from "@/lib/share/texts";

/**
 * GET /api/og/<moment>[?id=<uuid>][&r=<typ:počet,…>][&v=<hash>] – OG obrázek 1200×630 (SPEC §9.4).
 * podpis / zakon / srovnani čtou podpis z cache `sig:<uuid>` (jméno jen se souhlasem),
 * dopisy jen počty z URL, fotka je obecná (server fotku nikdy nedostane),
 * demonstrace čte veřejná data panáčka (?id=<uuid panáčka>) – jen schválený text a jméno.
 * CDN cache: obrázky s `v` (mění se s obsahem) den, srovnání 5 min, bez podpisu hodinu.
 */
export const dynamic = "force-dynamic";

const LONG = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const MEDIUM = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const SHORT = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";

export async function GET(req: NextRequest, ctx: { params: Promise<{ moment: string }> }): Promise<Response> {
  const { moment } = await ctx.params;
  if (!isMoment(moment)) return new Response("Not found", { status: 404 });
  const texts = shareTexts().share;
  const img = texts.image;
  const q = req.nextUrl.searchParams;
  const versioned = q.has("v");

  let card: ShareCard;
  let cache = MEDIUM;
  try {
    if (moment === "dopisy") {
      card = dopisyCard(parseRecipients(q.get("r")), img, texts.recipients);
      cache = LONG;
    } else if (moment === "demonstrace") {
      const r = await demonstraceShareCard(q.get("id") ?? "", img);
      card = r.card;
      cache = r.found && versioned ? LONG : r.found ? MEDIUM : SHORT;
    } else if (moment === "fotka") {
      card = fotkaCard(img);
      cache = LONG;
    } else {
      const found = await lookupSignature(q.get("id") ?? "");
      const sig = found.status === "ok" ? found.signature : null;
      if (moment === "srovnani") {
        let percent: number | null = null;
        if (sig) {
          const stats = await getCachedStats();
          if (stats) percent = comparisonFor(sig.answers, stats, await getCachedOrganizations()).overallPercent;
        }
        card = srovnaniCard(percent, img);
        cache = SHORT;
      } else {
        const make = moment === "zakon" ? zakonCard : podpisCard;
        card = make(sig?.answers ?? {}, questionsFile, img, sig?.name ?? null);
        cache = sig && versioned ? LONG : sig ? MEDIUM : SHORT;
      }
    }
    return await renderOg(card, cache);
  } catch (e) {
    console.error("[og] generování selhalo:", (e as Error).message);
    return new Response("Failed to generate the image", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
