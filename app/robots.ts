import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, siteUrl } from "@/lib/seo/site";

/**
 * robots.txt: veřejné stránky ano, osobní a tokenové stránky a API ne (samy mají i `noindex`).
 * /api/og/ zůstává povolené kvůli náhledům sdílených odkazů.
 *
 * Roboti náhledů sociálních sítí (X/Twitterbot robots.txt dodržuje) navíc smí na /v/ – sdílený
 * odkaz na osobní stránku musí mít náhled s obrázkem. Indexaci /v/ dál brání `noindex`.
 */
const PREVIEW_BOTS = [
  "Twitterbot",
  "facebookexternalhit",
  "Facebot",
  "LinkedInBot",
  "Slackbot-LinkExpanding",
  "Discordbot",
  "TelegramBot",
  "WhatsApp",
];

export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/api/og/"], disallow: [...PRIVATE_PATHS] },
      { userAgent: PREVIEW_BOTS, allow: ["/", "/api/og/", "/v/"], disallow: PRIVATE_PATHS.filter((p) => p !== "/v/") },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
