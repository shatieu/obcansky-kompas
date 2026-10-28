import type { Metadata } from "next";
import type { PublicSignature } from "@/lib/sign/read";
import { formatRecipients, isMoment, ogImagePath, shareSentence, shortHash, type Moment, type RecipientCounts } from "./moments";

/**
 * Open Graph metadata pro sdílené odkazy (SPEC §9.4). Moment se bere z `?s=`.
 * Použití v generateMetadata: `{ ...shareMetadata("dopisy", { r }) }`.
 */
export function momentFromSearch(s: string | string[] | undefined, fallback: Moment): Moment {
  const v = Array.isArray(s) ? s[0] : s;
  return isMoment(v) ? v : fallback;
}

/** Cache-buster obrázku: mění se s odpověďmi a se jménem (souhlas). */
export function signatureVersion(sig: Pick<PublicSignature, "answers" | "name" | "contentVersion">): string {
  return shortHash(JSON.stringify([sig.answers, sig.name, sig.contentVersion]));
}

export function shareMetadata(
  moment: Moment,
  q: { id?: string; v?: string; recipients?: RecipientCounts; description?: string; title?: string } = {},
): Pick<Metadata, "openGraph" | "twitter"> {
  // U srovnání věta obsahuje procento – zná ho jen volající.
  const title = q.title ?? (moment === "srovnani" ? undefined : shareSentence(moment));
  const image = {
    url: ogImagePath(moment, { id: q.id, v: q.v, r: q.recipients ? formatRecipients(q.recipients) || undefined : undefined }),
    width: 1200,
    height: 630,
    alt: title ?? shareSentence("podpis"),
  };
  return {
    openGraph: { type: "website", locale: "cs_CZ", images: [image], ...(title ? { title } : {}), ...(q.description ? { description: q.description } : {}) },
    twitter: { card: "summary_large_image", images: [image.url], ...(title ? { title } : {}) },
  };
}
