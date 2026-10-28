import type { SentencesFile } from "@/lib/content/schemas";
import type { ContentBundle } from "./core";
import { currentBundle } from "./current";
import { QUESTION_IDS } from "./types";
import sentences20261028_1 from "./frozen/sentences-2026-10-28.1.json";

/**
 * Registr verzí obsahu pro přesnou rekonstrukci podepsaného textu (SPEC §6, `content_version`).
 * Při změně vět zmraz starou verzi do ./frozen/sentences-<version>.json – tak, jak ji tehdy
 * načetla aplikace (ne jak „měla“ vypadat) – a zaregistruj ji níže i s tehdejším pořadím otázek.
 */
const registry = new Map<string, ContentBundle>();

export function registerContent(bundle: ContentBundle) {
  registry.set(bundle.sentences.version, bundle);
}

registerContent(currentBundle);

/**
 * 2026-10-28.1 (první nasazení): jedna věta na volbu, otázky v pořadí id (q1 první).
 * Věty s neuvozovkovanou čárkou v YAML flow mapě se tehdy utnuly za čárkou
 * (např. q2-opt3 „Peníze mají jít ze státního rozpočtu“) – tak je lidé podepsali a tak se rekonstruují.
 */
registerContent({
  ...currentBundle,
  questions: { ...currentBundle.questions, order: [...QUESTION_IDS] },
  sentences: sentences20261028_1 as unknown as SentencesFile,
});

export function getBundle(version: string): ContentBundle {
  const b = registry.get(version);
  if (!b) throw new Error(`Neznámá verze obsahu: ${version}`);
  return b;
}

export function registeredVersions(): string[] {
  return [...registry.keys()];
}
