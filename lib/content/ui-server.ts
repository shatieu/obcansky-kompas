/**
 * Serverové sekce content/ui.yaml (sign, verify, page, email, photo, akce, zakon).
 * Do klientského content/generated/ui.json se nezapisují, čtou se tady přímo ze zdroje.
 * Jen pro server (fs).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export const UI_YAML_PATH = path.join(process.cwd(), "content", "ui.yaml");

const cache = new Map<string, Record<string, unknown>>();

export function readUiYaml(file = UI_YAML_PATH): Record<string, unknown> {
  let raw = cache.get(file);
  if (!raw) {
    raw = (parse(readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
    cache.set(file, raw);
  }
  return raw;
}
