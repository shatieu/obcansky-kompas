import { z } from "zod";
import { readUiYaml } from "@/lib/content/ui-server";

/**
 * Texty pro vyhledávače a sdílení (jen server): content/ui.yaml, serverová sekce `seo`
 * (do klientského ui.json se nezapisuje). Popisy stránek max. 160 znaků – víc Google ořízne;
 * hlídá schéma i `pnpm lint:content`.
 */
export const META_DESCRIPTION_MAX = 160;

const s = z.string().min(1);
const description = s.max(META_DESCRIPTION_MAX);

export const seoTextsSchema = z.object({
  site_name: s,
  short_name: s,
  image_alt: s,
  /** Prázdné = TODO(owner), Organization se do JSON-LD nevypisuje. */
  organization_name: z.string(),
  descriptions: z.object({
    kompas: description,
    statistiky: description,
    akce: description,
    hnuti: description,
    metodika: description,
    zdroje: description,
    o_projektu: description,
    soukromi: description,
  }),
});

export type SeoTexts = z.infer<typeof seoTextsSchema>;

let cache: SeoTexts | undefined;

export function seoTexts(): SeoTexts {
  cache ??= seoTextsSchema.parse(readUiYaml().seo);
  return cache;
}
