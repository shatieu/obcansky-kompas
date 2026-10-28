import { facts as currentFacts, questionsFile as currentQuestions, sentencesFile as currentSentences, ui } from "@/lib/content";
import type { FactValue as Fact, QuestionsFile, SentencesFile } from "@/lib/content/schemas";
import { evaluate, isAnswered } from "./engine";
import { bandThresholds, formatAmount, q1Band } from "./q1";
import { QUESTION_IDS, type Answers } from "./types";

export * from "./types";
export { evaluate, isAnswered, isNevim, nevimId } from "./engine";

/**
 * Skládání textu k podpisu (SPEC §6). Deterministické: úvod + jedna věta za každou
 * zodpovězenou otázku + závěr. Čistá funkce sdílená klientem i serverem.
 */

export interface ContentBundle {
  questions: QuestionsFile;
  sentences: SentencesFile;
  facts: Fact[];
  /** Jednotky pro částku Q1 (z ui.yaml). */
  units: { unit_decimal: string; unit_whole: string };
}

/**
 * Registr verzí obsahu pro přesnou rekonstrukci podepsaného textu. Při změně vět
 * přidej sem starou verzi (zmrazený JSON) pod jejím `version`.
 */
const registry = new Map<string, ContentBundle>();

export function registerContent(bundle: ContentBundle) {
  registry.set(bundle.sentences.version, bundle);
}

export function currentContentVersion(): string {
  return currentSentences.version;
}

function getBundle(version: string): ContentBundle {
  if (!registry.has(currentSentences.version)) {
    registerContent({
      questions: currentQuestions,
      sentences: currentSentences,
      facts: currentFacts,
      units: { unit_decimal: ui.slider.unit_decimal, unit_whole: ui.slider.unit_whole },
    });
  }
  const b = registry.get(version);
  if (!b) throw new Error(`Neznámá verze obsahu: ${version}`);
  return b;
}

export interface StatementPart {
  questionId: string | null;
  sentenceId: string;
  sentenceVersion: number;
  text: string;
}

export interface Statement {
  contentVersion: string;
  parts: StatementPart[];
  text: string;
}

export interface ComposeOptions {
  /** Vynechat věty „Nevím“ (SPEC §6: „lze skrýt“). */
  hideUnknown?: boolean;
}

/** „a, b a c“ */
export function joinCzech(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} a ${items[items.length - 1]}`;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export function composeWith(bundle: ContentBundle, answers: Answers, options: ComposeOptions = {}): Statement {
  const { questions, sentences } = bundle;
  const { effective, states } = evaluate(answers, questions);
  const parts: StatementPart[] = [
    { questionId: null, sentenceId: sentences.intro.id, sentenceVersion: sentences.intro.version, text: sentences.intro.text },
  ];
  const thresholds = bandThresholds(questions, bundle.facts);

  for (const qid of QUESTION_IDS) {
    const q = questions.questions.find((x) => x.id === qid)!;
    const value = effective[qid];
    if (states[qid].status === "skipped" || !isAnswered(value)) continue;
    const nevim = q.options.find((o) => o.nevim)!.id;
    const isNevim = Array.isArray(value) ? value[0] === nevim : value === nevim;
    if (isNevim) {
      if (options.hideUnknown) continue;
      parts.push({
        questionId: qid,
        sentenceId: `${sentences.nevim.id}-${qid}`,
        sentenceVersion: sentences.nevim.version,
        text: fill(sentences.nevim.text, { topic: q.topic }),
      });
      continue;
    }
    if (q.type === "slider") {
      if (typeof value !== "number" || !thresholds) continue;
      const band = q1Band(value, thresholds);
      const s = sentences.q1.find((x) => x.band === band)!;
      parts.push({
        questionId: qid,
        sentenceId: s.id,
        sentenceVersion: s.version,
        text: fill(s.text, { amount: formatAmount(value, bundle.units) }),
      });
      continue;
    }
    if (q.type === "multi") {
      const list = value as string[];
      const exclusive = list.length === 1 ? sentences.options[list[0]!] : undefined;
      if (exclusive?.text) {
        parts.push({ questionId: qid, sentenceId: list[0]!, sentenceVersion: exclusive.version, text: exclusive.text });
        continue;
      }
      const tpl = sentences.multi[qid]!;
      const frags = list.map((o) => sentences.options[o]?.fragment).filter((f): f is string => Boolean(f));
      parts.push({
        questionId: qid,
        sentenceId: `${tpl.id}:${list.join("+")}`,
        sentenceVersion: Math.max(tpl.version, ...list.map((o) => sentences.options[o]?.version ?? 1)),
        text: fill(tpl.text, { items: joinCzech(frags) }),
      });
      continue;
    }
    const s = sentences.options[value as string];
    if (!s?.text) continue;
    parts.push({ questionId: qid, sentenceId: value as string, sentenceVersion: s.version, text: s.text });
  }

  parts.push({ questionId: null, sentenceId: sentences.outro.id, sentenceVersion: sentences.outro.version, text: sentences.outro.text });
  return { contentVersion: sentences.version, parts, text: parts.map((p) => p.text).join(" ") };
}

/** Veřejné API dle SPEC §6. */
export function composeStatement(answers: Answers, contentVersion: string, options: ComposeOptions = {}): Statement {
  return composeWith(getBundle(contentVersion), answers, options);
}
