import type { QuestionsFile } from "@/lib/content/schemas";
import { evaluate, isAnswered } from "@/lib/compose/engine";
import { q1Band, type BandThresholds } from "@/lib/compose/q1";
import { QUESTION_IDS, type Answers, type AnswerValue, type QuestionId } from "@/lib/compose/types";
import { q7Key, type StatsResult } from "./aggregate";

/**
 * Srovnání pro /v/[uuid]/srovnani (SPEC §8). Čistá funkce:
 * - u každé otázky % lidí se stejnou odpovědí (Q1 = stejné pásmo, Q7 = stejná sada voleb),
 * - shoda se stranami a hnutími = podíl otázek se stejnou odpovědí; nepočítají se „Nevím“
 *   a zašedlé (odpadlé) otázky na žádné straně; řazení abecedně.
 */

export interface QuestionComparison {
  questionId: QuestionId;
  /** Klíč odpovědi uživatele (id volby / pásmo Q1 / sada Q7) nebo null, když neodpověděl. */
  key: string | null;
  same: number;
  total: number;
  /** Celé procento, null když není s čím srovnat. */
  percent: number | null;
}

export interface OrgInput {
  name: string;
  /** null = neodpověděl/a. */
  answers: Answers | null;
}

export interface OrgComparison {
  name: string;
  answered: boolean;
  /** Počet otázek, které šly srovnat. */
  compared: number;
  matches: number;
  percent: number | null;
}

export interface Comparison {
  questions: QuestionComparison[];
  /** Průměr procent přes otázky, kde uživatel neodpověděl „Nevím“ (pro sdílení „Shoduji se s X %“). */
  overallPercent: number | null;
  organizations: OrgComparison[];
}

/** Klíč odpovědi pro srovnání; null = nesrovnává se (bez odpovědi). */
export function answerKey(qid: QuestionId, value: AnswerValue | undefined, t: BandThresholds | null): string | null {
  if (!isAnswered(value)) return null;
  if (typeof value === "number") return qid === "q1" && t ? q1Band(value, t) : null;
  if (Array.isArray(value)) return q7Key(value);
  return value as string;
}

function nevimKey(file: QuestionsFile, qid: QuestionId): string {
  return file.questions.find((q) => q.id === qid)!.options.find((o) => o.nevim)!.id;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function compare(input: {
  answers: Answers;
  stats: StatsResult;
  organizations: OrgInput[];
  questionsFile: QuestionsFile;
  thresholds: BandThresholds | null;
}): Comparison {
  const { questionsFile: file, thresholds: t } = input;
  const user = evaluate(input.answers, file);

  const questions: QuestionComparison[] = QUESTION_IDS.map((qid) => {
    const key = user.states[qid].status === "skipped" ? null : answerKey(qid, user.effective[qid], t);
    const qs = input.stats.questions[qid];
    if (key === null) return { questionId: qid, key, same: 0, total: qs.total, percent: null };
    const same = qid === "q7" ? (input.stats.q7Sets[key] ?? 0) : (qs.counts[key] ?? 0);
    return { questionId: qid, key, same, total: qs.total, percent: pct(same, qs.total) };
  });

  const counted = questions.filter((q) => q.percent !== null && q.key !== nevimKey(file, q.questionId));
  const overallPercent = counted.length
    ? Math.round(counted.reduce((s, q) => s + (q.percent ?? 0), 0) / counted.length)
    : null;

  const comparable = (ev: ReturnType<typeof evaluate>, qid: QuestionId): string | null => {
    if (ev.states[qid].status === "skipped") return null;
    const k = answerKey(qid, ev.effective[qid], t);
    return k === null || k === nevimKey(file, qid) ? null : k;
  };

  const organizations: OrgComparison[] = input.organizations
    .map((org) => {
      if (!org.answers) return { name: org.name, answered: false, compared: 0, matches: 0, percent: null };
      const ev = evaluate(org.answers, file);
      let compared = 0;
      let matches = 0;
      for (const qid of QUESTION_IDS) {
        const a = comparable(user, qid);
        const b = comparable(ev, qid);
        if (a === null || b === null) continue;
        compared++;
        if (a === b) matches++;
      }
      return { name: org.name, answered: true, compared, matches, percent: pct(matches, compared) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  return { questions, overallPercent, organizations };
}
