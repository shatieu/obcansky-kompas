import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { z } from "zod";
import {
  EXPLAINER_FILE_RE,
  explainerSchema,
  factsFileSchema,
  plainLanguageSchema,
  questionsFileSchema,
  sentencesFileSchema,
  shareFileSchema,
  slogansFileSchema,
  stanceFileSchema,
  uiTreeSchema,
  type Explainer,
} from "./schemas";
import type { BannedTerm } from "./text";

/** Načtení a validace content/*.yaml – jen pro Node skripty (build, lint, seed). */

export const CONTENT_DIR = path.join(process.cwd(), "content");

export class ContentError extends Error {}

function readYaml(file: string): unknown {
  return parse(readFileSync(file, "utf8"));
}

function validate<T extends z.ZodType>(schema: T, file: string): z.infer<T> {
  let data: unknown;
  try {
    data = readYaml(file);
  } catch (e) {
    throw new ContentError(`${path.relative(process.cwd(), file)}: neplatný YAML – ${(e as Error).message}`);
  }
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  ${i.path.join(".") || "(kořen)"}: ${i.message}`).join("\n");
    throw new ContentError(`${path.relative(process.cwd(), file)}: neplatný obsah\n${issues}`);
  }
  return r.data;
}

export function loadExplainers(dir = path.join(CONTENT_DIR, "explainers")): { file: string; explainer: Explainer }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => EXPLAINER_FILE_RE.test(f))
    .sort()
    .map((f) => {
      const explainer = validate(explainerSchema, path.join(dir, f));
      if (`${explainer.id}.yaml` !== f) throw new ContentError(`explainers/${f}: id ${explainer.id} neodpovídá názvu souboru`);
      return { file: f, explainer };
    });
}

function normaliseBanned(raw: unknown): BannedTerm[] {
  const out: BannedTerm[] = [];
  const push = (term: unknown, replacement: unknown) => {
    if (typeof term === "string" && term.trim())
      out.push({ term: term.trim(), replacement: typeof replacement === "string" ? replacement : undefined });
  };
  const fromList = (list: unknown[]) => {
    for (const item of list) {
      if (typeof item === "string") push(item, undefined);
      else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(o.term ?? o.banned ?? o.výraz ?? o.vyraz, o.replacement ?? o.plain ?? o.náhrada ?? o.nahrada);
      }
    }
  };
  if (Array.isArray(raw)) fromList(raw);
  else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const list = o.terms ?? o.banned ?? o.zakazane;
    if (Array.isArray(list)) fromList(list);
    else for (const [k, v] of Object.entries(o)) if (typeof v === "string") push(k, v);
  }
  return out;
}

export function loadPlainLanguage(file = path.join(CONTENT_DIR, "plain-language.yaml")): BannedTerm[] {
  if (!existsSync(file)) return [];
  const raw = readYaml(file);
  plainLanguageSchema.parse(raw);
  return normaliseBanned(raw);
}

export function loadContent(dir = CONTENT_DIR) {
  return {
    questions: validate(questionsFileSchema, path.join(dir, "questions.yaml")),
    sentences: validate(sentencesFileSchema, path.join(dir, "sentences.yaml")),
    facts: validate(factsFileSchema, path.join(dir, "facts.yaml")),
    ui: validate(uiTreeSchema, path.join(dir, "ui.yaml")),
    stance: validate(stanceFileSchema, path.join(dir, "stance.yaml")),
    share: validate(shareFileSchema, path.join(dir, "share.yaml")),
    slogans: validate(slogansFileSchema, path.join(dir, "slogans.yaml")),
    explainers: loadExplainers(path.join(dir, "explainers")),
  };
}

export type LoadedContent = ReturnType<typeof loadContent>;
