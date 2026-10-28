import { z } from "zod";
import { ADDRESSEE_TYPES } from "@/lib/letters/schema";
import { readUiYaml } from "@/lib/content/ui-server";

/**
 * Texty sdílení a srovnání (content/ui.yaml, sekce share a compare_page). Čtou se jen na serveru
 * a do klientských komponent se předávají jako props (do klientského ui.json se nezapisují).
 */
const str = z.string().min(1);
const group = <T extends readonly string[]>(keys: T) =>
  z.object(Object.fromEntries(keys.map((k) => [k, str])) as { [K in T[number]]: typeof str });

const forms = z.tuple([str, str, str]);

export const shareTextsSchema = z.object({
  share: group([
    "open_button", "sheet_title", "sheet_lead", "native_button", "copy_button", "copied", "copy_failed",
    "download_story_button", "download_square_button", "networks_label", "link_label", "close_button",
    "preview_alt", "rendering", "render_failed",
  ] as const).extend({
    networks: group(["facebook", "x", "whatsapp", "telegram", "linkedin", "email"] as const),
    image: group([
      "brand", "choices_kicker", "law_title", "law_kicker", "letters_kicker", "letters_none", "match_kicker",
      "photo_kicker", "photo_line",
    ] as const),
    recipients: z.object(Object.fromEntries(ADDRESSEE_TYPES.map((k) => [k, forms])) as Record<(typeof ADDRESSEE_TYPES)[number], typeof forms>),
  }),
  compare_page: group([
    "meta_title", "kicker", "title", "lead", "overall_label", "overall_none", "your_answer", "same_answer",
    "same_count", "no_answer", "skipped", "no_data", "disclaimer", "orgs_title", "orgs_lead", "org_agreement",
    "org_detail", "org_not_comparable", "org_not_answered", "orgs_empty", "share_button", "back_button",
    "withdrawn_title", "withdrawn_lead", "unavailable_title", "unavailable_lead", "static_demo",
  ] as const),
});

export type ShareTextsFile = z.infer<typeof shareTextsSchema>;
export type ShareUiTexts = ShareTextsFile["share"];
export type ShareImageTexts = ShareUiTexts["image"];
export type ComparePageTexts = ShareTextsFile["compare_page"];

let cache: ShareTextsFile | null = null;

export function shareTexts(): ShareTextsFile {
  if (cache) return cache;
  const raw = readUiYaml();
  cache = shareTextsSchema.parse({ share: raw.share, compare_page: raw.compare_page });
  return cache;
}

/** Texty pro klientský SharePanel (bez textů obrázku a tvarů adresátů). */
export function sharePanelTexts(): Omit<ShareUiTexts, "image" | "recipients"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { image, recipients, ...rest } = shareTexts().share;
  return rest;
}
