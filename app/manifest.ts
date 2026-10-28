import type { MetadataRoute } from "next";
import { ui } from "@/lib/content";
import { seoTexts } from "@/lib/seo/texts";

/**
 * Web manifest (/manifest.webmanifest). Web je vždy světlý, proto bílé téma i pozadí.
 * Ikony generuje scripts/generate-icons.ts: vlajka 3:2 na bílé, celá v bezpečném kruhu
 * maskable ikon – stejný soubor slouží jako `any` i `maskable`.
 */
export default function manifest(): MetadataRoute.Manifest {
  const t = seoTexts();
  const icons = ([192, 512] as const).flatMap((size) =>
    (["any", "maskable"] as const).map((purpose) => ({ src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose })),
  );
  return {
    name: t.site_name,
    short_name: t.short_name,
    description: ui.home.meta_description,
    lang: "cs",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    icons,
  };
}
