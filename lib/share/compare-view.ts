import type { QuestionId } from "@/lib/compose/types";
import type { QuestionsFile } from "@/lib/content/schemas";
import type { Comparison } from "@/lib/stats/compare";

/**
 * Popisky pro stránku /v/[uuid]/srovnani (SPEC §8). Čisté funkce nad výsledkem compare().
 * Klíč odpovědi: id volby, pásmo Q1 (id z q1_bands), u Q7 sada id spojená „+“.
 */
export function answerKeyLabel(file: QuestionsFile, qid: QuestionId, key: string): string {
  const q = file.questions.find((x) => x.id === qid);
  if (!q) return key;
  const opt = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
  if (qid === "q1") return file.q1_bands.find((b) => b.id === key)?.label ?? opt(key);
  if (qid === "q7") return key.split("+").map(opt).join(", ");
  return opt(key);
}

export type QuestionRowState = "compared" | "no_data" | "skipped" | "no_answer";

export interface QuestionRow {
  questionId: QuestionId;
  question: string;
  answer: string | null;
  state: QuestionRowState;
  percent: number | null;
  same: number;
  total: number;
}

/** Řádky otázek v pořadí kompasu. `skipped` = otázka pro uživatele odpadla (zašedlá). */
export function questionRows(cmp: Comparison, file: QuestionsFile, skipped: ReadonlySet<QuestionId>): QuestionRow[] {
  return cmp.questions.map((q) => {
    const meta = file.questions.find((x) => x.id === q.questionId)!;
    const base = { questionId: q.questionId, question: meta.short, same: q.same, total: q.total, percent: q.percent };
    if (skipped.has(q.questionId)) return { ...base, answer: null, state: "skipped", percent: null };
    if (q.key === null) return { ...base, answer: null, state: "no_answer", percent: null };
    const answer = answerKeyLabel(file, q.questionId, q.key);
    if (q.percent === null) return { ...base, answer, state: "no_data" };
    return { ...base, answer, state: "compared" };
  });
}
