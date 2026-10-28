import type { FactValue as Fact, QuestionsFile, SentencesFile } from "@/lib/content/schemas";
import { evaluate, isAnswered } from "./engine";
import { questionOrder } from "./order";
import { bandThresholds, formatAmount, q1Band } from "./q1";
import type { Answers, QuestionId } from "./types";

/**
 * Skládání textu k podpisu (SPEC §6). Deterministické: úvod + jedna věta za každou
 * zodpovězenou otázku v pořadí zobrazení + závěr. Čistá funkce sdílená klientem i serverem.
 * Bez registru starých verzí – ten je v ./registry (kompas ho do svého JS nepotřebuje).
 *
 * Výsledek je strukturovaný (požadavek vlastníka 2026-10-28): `intro`, `blocks` (jeden blok
 * za zodpovězenou otázku, s krátkým štítkem `short` z questions.yaml) a `outro`. `text` je
 * prostý text s odstavci a štítky („Odkud peníze: …“) pro e-mail a exporty; `parts` zůstávají
 * pro dopisy (věty bez štítků).
 */

export interface ContentBundle {
  questions: QuestionsFile;
  sentences: SentencesFile;
  facts: Fact[];
  /** Jednotky pro částku Q1 (z ui.yaml). */
  units: { unit_decimal: string; unit_whole: string };
}

export interface StatementPart {
  questionId: string | null;
  sentenceId: string;
  sentenceVersion: number;
  text: string;
}

/** Odstavec textu patřící k jedné otázce. */
export interface StatementBlock extends StatementPart {
  questionId: QuestionId;
  /** Krátké téma otázky (`short` v questions.yaml), např. „Odkud peníze“. */
  label: string;
  /** Odpověď „Nevím“ (věta „nechávám rozhodnutí na odbornících“). */
  nevim: boolean;
}

export interface Statement {
  contentVersion: string;
  /** Úvod, věty otázek v pořadí zobrazení, závěr – bez štítků (dopisy, testy). */
  parts: StatementPart[];
  intro: StatementPart;
  /** Jeden blok za zodpovězenou otázku v pořadí zobrazení. */
  blocks: StatementBlock[];
  outro: StatementPart;
  /** Prostý text: odstavce oddělené prázdným řádkem, bloky se štítkem („Odkud peníze: …“). */
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

/** Prostý text: úvod, „Štítek: věta“ za každý blok, závěr; odstavce oddělené prázdným řádkem. */
export function statementPlainText(s: Pick<Statement, "intro" | "blocks" | "outro">): string {
  return [s.intro.text, ...s.blocks.map((b) => `${b.label}: ${b.text}`), s.outro.text].join("\n\n");
}

export function composeWith(bundle: ContentBundle, answers: Answers, options: ComposeOptions = {}): Statement {
  const { questions, sentences } = bundle;
  const { effective, states } = evaluate(answers, questions);
  const intro: StatementPart = { questionId: null, sentenceId: sentences.intro.id, sentenceVersion: sentences.intro.version, text: sentences.intro.text };
  const outro: StatementPart = { questionId: null, sentenceId: sentences.outro.id, sentenceVersion: sentences.outro.version, text: sentences.outro.text };
  const blocks: StatementBlock[] = [];
  const thresholds = bandThresholds(questions, bundle.facts);

  for (const qid of questionOrder(questions)) {
    const q = questions.questions.find((x) => x.id === qid)!;
    const value = effective[qid];
    if (states[qid].status === "skipped" || !isAnswered(value)) continue;
    const nevim = q.options.find((o) => o.nevim)!.id;
    const isNevim = Array.isArray(value) ? value[0] === nevim : value === nevim;
    const push = (p: Omit<StatementPart, "questionId">) => blocks.push({ ...p, questionId: qid, label: q.short, nevim: isNevim });
    if (isNevim) {
      if (options.hideUnknown) continue;
      push({
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
      push({
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
        push({ sentenceId: list[0]!, sentenceVersion: exclusive.version, text: exclusive.text });
        continue;
      }
      const tpl = sentences.multi[qid]!;
      const frags = list.map((o) => sentences.options[o]?.fragment).filter((f): f is string => Boolean(f));
      push({
        sentenceId: `${tpl.id}:${list.join("+")}`,
        sentenceVersion: Math.max(tpl.version, ...list.map((o) => sentences.options[o]?.version ?? 1)),
        text: fill(tpl.text, { items: joinCzech(frags) }),
      });
      continue;
    }
    const s = sentences.options[value as string];
    if (!s?.text) continue;
    push({ sentenceId: value as string, sentenceVersion: s.version, text: s.text });
  }

  const parts: StatementPart[] = [intro, ...blocks.map(({ questionId, sentenceId, sentenceVersion, text }) => ({ questionId, sentenceId, sentenceVersion, text })), outro];
  return { contentVersion: sentences.version, parts, intro, blocks, outro, text: statementPlainText({ intro, blocks, outro }) };
}
