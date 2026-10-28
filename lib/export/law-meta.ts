import type { LawDocument } from "@/lib/law";

/**
 * Řádky hlavičky zákona (verze modulů, verze obsahu, datum, UUID) – sdílené obrazovkou,
 * PDF i DOCX. Čistá funkce.
 */
export function lawMetaLines(law: LawDocument): string[] {
  const h = law.header;
  return [
    `${h.labels.modules}: ${h.modules.map((m) => `${m.id} v${m.version}`).join(", ")}`,
    `${h.labels.contentVersion}: ${h.contentVersion}`,
    `${h.labels.date}: ${h.date}`,
    `${h.labels.id}: ${h.uuid}`,
  ];
}

/** Název souboru: „muj-zakon-<prvních 8 znaků UUID>“. */
export function lawFileBase(prefix: string, uuid: string): string {
  const short = uuid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return short ? `${prefix}-${short}` : prefix;
}
