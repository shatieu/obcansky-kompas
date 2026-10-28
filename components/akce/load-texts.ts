import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { UiAkceFile } from "./texts";

/**
 * Načte content/ui-akce.yaml (jen server). Po sloučení do ui.yaml nahradit za
 * `import { ui } from "@/lib/content"` → `{ akce: ui.akce, zakon: ui.zakon }`.
 */
let cache: UiAkceFile | null = null;

export function loadUiAkce(): UiAkceFile {
  if (cache) return cache;
  const raw = parse(readFileSync(path.join(process.cwd(), "content", "ui-akce.yaml"), "utf8")) as Partial<UiAkceFile> | null;
  if (!raw?.akce || !raw.zakon) throw new Error("content/ui-akce.yaml: chybí sekce akce nebo zakon");
  cache = raw as UiAkceFile;
  return cache;
}
