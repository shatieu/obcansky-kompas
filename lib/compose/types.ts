export type QuestionId = "q1" | "q2" | "q3" | "q4" | "q5" | "q6" | "q7" | "q8";
export const QUESTION_IDS: QuestionId[] = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];

/**
 * Odpověď: id volby (single), pole id voleb (multi), číslo v mld Kč (Q1 posuvník),
 * nebo id volby „Nevím“ (např. "q1-nevim").
 */
export type AnswerValue = string | string[] | number;
export type Answers = Partial<Record<QuestionId, AnswerValue>>;

export interface Demographics {
  region?: string;
  ageGroup?: string;
  municipalitySize?: string;
  comment?: string;
}
