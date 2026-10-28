import { ui } from "@/lib/content";
import { siteUrl } from "./site";
import { seoTexts } from "./texts";

/**
 * Strukturovaná data hlavní stránky (schema.org, JSON-LD): WebSite a – až vlastník doplní název
 * spolku (`seo.organization_name`, TODO(owner)) – Organization jako vydavatel. Nic vymyšleného:
 * bez názvu se Organization nevypisuje.
 *
 * CSP: `<script type="application/ld+json">` je datový blok, prohlížeč ho nespouští a script-src
 * se na něj nevztahuje (a statická CSP stránky má pro inline skripty stejně 'unsafe-inline').
 */
export function homeJsonLd(): Record<string, unknown> {
  const t = seoTexts();
  const site = siteUrl();
  const orgName = t.organization_name.trim();
  const orgId = `${site}/#organizace`;
  const website = {
    "@type": "WebSite",
    "@id": `${site}/#web`,
    url: `${site}/`,
    name: t.site_name,
    alternateName: t.short_name,
    description: ui.home.meta_description,
    inLanguage: "cs",
    ...(orgName ? { publisher: { "@id": orgId } } : {}),
  };
  const graph: Record<string, unknown>[] = [website];
  if (orgName) graph.push({ "@type": "Organization", "@id": orgId, name: orgName, url: `${site}/` });
  return { "@context": "https://schema.org", "@graph": graph };
}

/** `<` → <, aby text nemohl ukončit značku <script>. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
