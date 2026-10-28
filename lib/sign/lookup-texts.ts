import { z } from "zod";
import { readUiYaml } from "@/lib/content/ui-server";

/**
 * Texty čísla podpisu a okna „Načíst moje odpovědi“ (content/ui.yaml, sekce `lookup`). Jen server;
 * do klientských komponent jako props – v klientském ui.json nejsou (JS /kompas, SPEC §4.6).
 */
const str = z.string().min(1);
export const LOOKUP_TEXT_KEYS = [
  "link", "title", "lead", "input_label", "input_hint", "submit_button", "cancel_button", "loading",
  "done_title", "done_lead", "open_page_button", "empty", "invalid", "not_found", "rate_limited", "unavailable",
  "short_id_label", "short_id_hint", "copy_button", "copied",
] as const;

export const lookupTextsSchema = z.object(
  Object.fromEntries(LOOKUP_TEXT_KEYS.map((k) => [k, str])) as { [K in (typeof LOOKUP_TEXT_KEYS)[number]]: typeof str },
);

export type LookupTexts = z.infer<typeof lookupTextsSchema>;

let cached: LookupTexts | undefined;

export function lookupTexts(): LookupTexts {
  cached ??= lookupTextsSchema.parse(readUiYaml().lookup);
  return cached;
}

/** Jen texty čísla podpisu (štítek, nápověda, kopírování) – pro stránky, kde okno načtení není. */
export function shortIdTexts(): ShortIdTexts {
  const t = lookupTexts();
  return { label: t.short_id_label, hint: t.short_id_hint, copy: t.copy_button, copied: t.copied };
}

export interface ShortIdTexts {
  label: string;
  hint: string;
  copy: string;
  copied: string;
}
