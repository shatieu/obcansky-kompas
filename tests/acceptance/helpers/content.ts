/**
 * Pomůcky pro akceptační testy obsahu. Záměrně NEpoužívají počítání slov a dělení vět
 * z lib/content/text.ts – akceptační testy mají limity ze SPEC §4.1 ověřit nezávisle.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";

export const ROOT = process.cwd();
export const CONTENT_DIR = path.join(ROOT, "content");

export function readYaml<T = unknown>(rel: string, dir = CONTENT_DIR): T {
  return parse(readFileSync(path.join(dir, rel), "utf8")) as T;
}

export function listYaml(relDir: string, dir = CONTENT_DIR): string[] {
  const d = path.join(dir, relDir);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith(".yaml"))
    .sort();
}

type Tree = { [k: string]: unknown };

/** Zploští ui.yaml na [klíč, text]; klíč je tečková cesta. */
export function flattenStrings(tree: unknown, prefix = ""): [string, string][] {
  if (typeof tree === "string") return [[prefix, tree]];
  if (!tree || typeof tree !== "object") return [];
  return Object.entries(tree as Tree).flatMap(([k, v]) => flattenStrings(v, prefix ? `${prefix}.${k}` : k));
}

/** Slovo = mezerami oddělený token, který obsahuje písmeno nebo číslici. */
export function words(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

const ABBR = new Set(["např", "tzv", "tj", "mld", "mil", "resp", "č", "odst", "str", "s", "sb", "kč", "atd", "apod", "mj", "zejm", "tis", "čl", "písm"]);

/** Věty: konec = . ! ? … následované mezerou a velkým písmenem/uvozovkou; ne za zkratkou. */
export function sentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let start = 0;
  const re = /[.!?…]+(?=\s+[\p{Lu}„"])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const before = clean.slice(start, m.index).split(" ").pop() ?? "";
    const w = before.toLowerCase().replace(/[^\p{L}]/gu, "");
    if (m[0] === "." && ABBR.has(w)) continue;
    out.push(clean.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  const rest = clean.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** Kopie content/ do dočasné složky (pro testy, které obsah záměrně rozbijí). */
export function copyContentToTemp(): { root: string; content: string } {
  const root = mkdtempSync(path.join(tmpdir(), "kompas-acc-"));
  const content = path.join(root, "content");
  cpSync(CONTENT_DIR, content, { recursive: true });
  return { root, content };
}

export interface QOption {
  id: string;
  label: string;
  nevim?: boolean;
  exclusive?: boolean;
}
export interface QQuestion {
  id: string;
  type: "slider" | "single" | "multi";
  text: string;
  topic: string;
  options: QOption[];
  anchors?: { id: string; label: string; fact: string; multiplier?: number }[];
  slider?: { min: number; max: number; step: number; default: number };
}
export interface QFile {
  version: number;
  questions: QQuestion[];
}

export function questionsYaml(dir = CONTENT_DIR): QFile {
  return readYaml<QFile>("questions.yaml", dir);
}

/** Id volby podle jejího textu ze SPEC §5.1 (tím test hlídá i to, že texty sedí se SPEC). */
export function optionIdByLabel(qid: string, label: string, file = questionsYaml()): string {
  const q = file.questions.find((x) => x.id === qid);
  if (!q) throw new Error(`otázka ${qid} v questions.yaml chybí`);
  const o = q.options.find((x) => x.label === label);
  if (!o) throw new Error(`${qid}: volba „${label}“ (SPEC §5.1) v questions.yaml chybí`);
  return o.id;
}
