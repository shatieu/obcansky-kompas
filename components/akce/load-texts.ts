import { readUiYaml } from "@/lib/content/ui-server";
import type { UiAkceFile } from "./texts";

/**
 * Texty /akce a /v/[uuid]/zakon z content/ui.yaml (sekce akce, zakon). Jen server;
 * do klientského ui.json se nezapisují.
 */
let cache: UiAkceFile | null = null;

export function loadUiAkce(): UiAkceFile {
  if (cache) return cache;
  const raw = readUiYaml() as Partial<UiAkceFile>;
  if (!raw.akce || !raw.zakon) throw new Error("content/ui.yaml: chybí sekce akce nebo zakon");
  cache = { akce: raw.akce, zakon: raw.zakon } as UiAkceFile;
  return cache;
}
