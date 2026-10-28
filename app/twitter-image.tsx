import { renderDefaultOg } from "@/lib/seo/og-default";
import { siteUrl } from "@/lib/seo/site";
import { seoTexts } from "@/lib/seo/texts";

/**
 * Výchozí sdílecí obrázek (lib/seo/og-default.tsx) pro stránky bez vlastního. Statický, vzniká při
 * buildu. Stránky s vlastním obrázkem (/v/*, /akce, /fotka, /demonstrace/[id] – lib/share/metadata)
 * si ho nastavují samy a ten jejich má přednost.
 */
export const alt = seoTexts().image_alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderDefaultOg(siteUrl());
}
