/**
 * Typovaný přístup k obsahu pro aplikaci (server i klient). Zdroj = content/generated/*.json,
 * které vytváří a validuje `scripts/content-build.ts`.
 */
import questionsJson from "@/content/generated/questions.json";
import sentencesJson from "@/content/generated/sentences.json";
import factValuesJson from "@/content/generated/fact-values.json";
import uiJson from "@/content/generated/ui.json";
import stanceJson from "@/content/generated/stance.json";
import type { FactValue, QuestionsFile, SentencesFile, StanceFile } from "./schemas";

export const questionsFile = questionsJson as unknown as QuestionsFile;
export const sentencesFile = sentencesJson as unknown as SentencesFile;
/** Hodnoty faktů (id + value). Plná tvrzení se zdroji jsou v content/facts.yaml. */
export const facts = factValuesJson as unknown as FactValue[];
export const stance = stanceJson as unknown as StanceFile;

export const CONTENT_VERSION = sentencesFile.version;

export type Ui = typeof uiJson;
export const ui: Ui = uiJson;

export function fact(id: string): FactValue | undefined {
  return facts.find((f) => f.id === id);
}

/** Doplní {klíč} v šabloně. */
export function t(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export type ExplainerEntry =
  | { status: "pending" }
  | {
      status: "verified";
      humanReviewed: boolean;
      text: string;
      pro: string | null;
      proti: string | null;
      sources: { id: string; title: string; url: string; locator: string }[];
    };
