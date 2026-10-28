import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/seo/site";

/** sitemap.xml: jen veřejné statické stránky (lib/seo/site.ts), nikdy osobní, tokenové ani API. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl();
  return PUBLIC_PAGES.map((p) => ({
    url: p === "/" ? `${site}/` : `${site}${p}`,
    changeFrequency: p === "/" || p === "/statistiky" || p.startsWith("/demonstrace") ? "daily" : "weekly",
    priority: p === "/" ? 1 : p === "/kompas" ? 0.9 : 0.6,
  }));
}
