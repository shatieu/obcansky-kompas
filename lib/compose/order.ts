import { questionsFile } from "@/lib/content";
import type { QuestionsFile } from "@/lib/content/schemas";
import type { QuestionId } from "./types";

/**
 * Pořadí zobrazení otázek (`order` v questions.yaml). Id otázek (q1…q8) se nemění – jsou
 * v uložených podpisech, statistikách, zákoně a dopisech; mění se jen pořadí a číslování.
 */
export function questionOrder(file: QuestionsFile): QuestionId[] {
  return file.order as QuestionId[];
}

/** Aktuální pořadí zobrazení. */
export const QUESTION_ORDER: QuestionId[] = questionOrder(questionsFile);

/** Číslo otázky pro zobrazení („Otázka n z 8“), od 1. */
export function questionNumber(qid: QuestionId, order: QuestionId[] = QUESTION_ORDER): number {
  return order.indexOf(qid) + 1;
}
