import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import manifest from "@/app/manifest";
import { homeJsonLd, serializeJsonLd } from "./json-ld";
import { PRIVATE_PATHS, PUBLIC_PAGES, siteUrl } from "./site";
import { META_DESCRIPTION_MAX, seoTexts } from "./texts";

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

describe("sitemap a robots", () => {
  it("sitemap obsahuje jen veřejné stránky s absolutní adresou z NEXT_PUBLIC_SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://kompas.test/";
    const urls = sitemap().map((e) => e.url);
    expect(urls).toHaveLength(PUBLIC_PAGES.length);
    expect(urls[0]).toBe("https://kompas.test/");
    expect(urls).toContain("https://kompas.test/demonstrace/seznam");
    for (const u of urls) {
      const p = new URL(u).pathname;
      expect(PRIVATE_PATHS.some((x) => p.startsWith(x) || `${p}/`.startsWith(x))).toBe(false);
      expect(p).not.toMatch(/^\/demonstrace\/(?!seznam$)[^/]+/);
    }
  });

  it("robots zakazuje osobní, tokenové stránky a API, povoluje OG obrázky a odkazuje na sitemap", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://kompas.test";
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const all = rules.find((x) => x.userAgent === "*")!;
    expect(all.disallow).toEqual(expect.arrayContaining(["/api/", "/v/", "/overeni/", "/org/", "/kompas/podpis", "/demonstrace/pripojit"]));
    expect(all.allow).toEqual(expect.arrayContaining(["/", "/api/og/"]));
    // Roboti náhledů smí na /v/ (sdílené osobní stránky), jinak stejná pravidla.
    const preview = rules.find((x) => Array.isArray(x.userAgent) && x.userAgent.includes("Twitterbot"))!;
    expect(preview.allow).toContain("/v/");
    expect(preview.disallow).not.toContain("/v/");
    expect(preview.disallow).toContain("/overeni/");
    expect(r.sitemap).toBe("https://kompas.test/sitemap.xml");
  });

  it("siteUrl bez koncového lomítka", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://kompas.test///";
    expect(siteUrl()).toBe("https://kompas.test");
  });
});

describe("texty a strukturovaná data", () => {
  it("popisy stránek mají nejvýš 160 znaků", () => {
    for (const d of Object.values(seoTexts().descriptions)) expect(d.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });

  it("JSON-LD: WebSite vždy, Organization jen s vyplněným názvem spolku; < se escapuje", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://kompas.test";
    const ld = homeJsonLd() as { "@graph": { "@type": string; url?: string }[] };
    expect(ld["@graph"][0]).toMatchObject({ "@type": "WebSite", url: "https://kompas.test/" });
    const hasOrg = ld["@graph"].some((g) => g["@type"] === "Organization");
    expect(hasOrg).toBe(seoTexts().organization_name.trim() !== "");
    expect(serializeJsonLd({ a: "</script><b>" })).toBe('{"a":"\\u003c/script>\\u003cb>"}');
  });

  it("manifest: krátký název Kompas, bílé barvy, ikony 192 a 512 any i maskable, soubory existují", () => {
    const m = manifest();
    expect(m.short_name).toBe("Kompas");
    expect(m.theme_color).toBe("#FFFFFF");
    expect(m.background_color).toBe("#FFFFFF");
    const icons = m.icons ?? [];
    for (const size of ["192x192", "512x512"])
      for (const purpose of ["any", "maskable"]) expect(icons.some((i) => i.sizes === size && i.purpose === purpose)).toBe(true);
    for (const i of icons) {
      const file = readFileSync(path.join(process.cwd(), "public", i.src));
      expect(file.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(file.readUInt32BE(16)).toBe(Number(i.sizes!.split("x")[0]));
    }
  });
});
