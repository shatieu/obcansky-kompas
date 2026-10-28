import type { QuestionsFile } from "@/lib/content/schemas";
import { q1Band, type BandThresholds } from "@/lib/compose/q1";
import { QUESTION_IDS, type Answers, type QuestionId } from "@/lib/compose/types";

/**
 * Tvar statistik (SPEC §8) a čistá agregace v TS. Stejný výsledek počítá jeden SQL dotaz
 * v `query.ts` (test to hlídá); TS verze slouží pro statický snímek (STATIC_DEMO=1).
 */

export interface StatsFilters {
  region?: string;
  ageGroup?: string;
  municipalitySize?: string;
}

export interface QuestionStats {
  /** Počet ověřených podpisů, které na otázku mají odpověď. */
  total: number;
  /** Klíč = id volby; u Q1 id pásma nebo „q1-nevim“. U Q7 se počítá každá vybraná volba. */
  counts: Record<string, number>;
}

export interface Combo {
  /** [q2, q3, q4] */
  options: [string, string, string];
  count: number;
}

export interface StatsResult {
  generatedAt: string;
  /** Data obsahují ukázkové záznamy (DEMO_MODE=1 nebo STATIC_DEMO=1). */
  demo: boolean;
  source: "db" | "snapshot";
  filters: StatsFilters;
  verified: number;
  pending: number;
  questions: Record<QuestionId, QuestionStats>;
  /** Q7: počty přesných kombinací (klíč = id seřazená a spojená „+“). */
  q7Sets: Record<string, number>;
  /** Nejčastější kombinace odpovědí Q2+Q3+Q4, max. 10. */
  topCombos: Combo[];
}

export interface StatsRow {
  answers: Answers;
  verified: boolean;
  region: string | null;
  ageGroup: string | null;
  municipalitySize: string | null;
}

/** Bytové (C) řazení, shodné s `collate "C"` v SQL. */
export const byteCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function q7Key(list: string[]): string {
  return [...list].sort(byteCompare).join("+");
}

export function emptyQuestions(): Record<QuestionId, QuestionStats> {
  return Object.fromEntries(QUESTION_IDS.map((q) => [q, { total: 0, counts: {} }])) as Record<QuestionId, QuestionStats>;
}

export function matchesFilters(row: StatsRow, f: StatsFilters): boolean {
  return (
    (!f.region || row.region === f.region) &&
    (!f.ageGroup || row.ageGroup === f.ageGroup) &&
    (!f.municipalitySize || row.municipalitySize === f.municipalitySize)
  );
}

export function aggregateRows(
  rows: StatsRow[],
  opts: { filters: StatsFilters; thresholds: BandThresholds | null; demo: boolean; source: StatsResult["source"]; now?: Date },
): StatsResult {
  const questions = emptyQuestions();
  const q7Sets: Record<string, number> = {};
  const combos = new Map<string, Combo>();
  let verified = 0;
  let pending = 0;

  for (const row of rows) {
    if (!matchesFilters(row, opts.filters)) continue;
    if (!row.verified) {
      pending++;
      continue;
    }
    verified++;
    for (const qid of QUESTION_IDS) {
      const v = row.answers[qid];
      if (v === undefined) continue;
      const qs = questions[qid];
      qs.total++;
      const keys: (string | null)[] = Array.isArray(v)
        ? v
        : typeof v === "number"
          ? [qid === "q1" && opts.thresholds ? q1Band(v, opts.thresholds) : null]
          : [v];
      for (const k of keys) if (k !== null) qs.counts[k] = (qs.counts[k] ?? 0) + 1;
      if (qid === "q7" && Array.isArray(v)) {
        const key = q7Key(v);
        q7Sets[key] = (q7Sets[key] ?? 0) + 1;
      }
    }
    const { q2, q3, q4 } = row.answers;
    if (typeof q2 === "string" && typeof q3 === "string" && typeof q4 === "string") {
      const key = `${q2}|${q3}|${q4}`;
      const c = combos.get(key) ?? { options: [q2, q3, q4], count: 0 };
      c.count++;
      combos.set(key, c);
    }
  }

  const topCombos = [...combos.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        byteCompare(a.options[0], b.options[0]) ||
        byteCompare(a.options[1], b.options[1]) ||
        byteCompare(a.options[2], b.options[2]),
    )
    .slice(0, 10);

  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    demo: opts.demo,
    source: opts.source,
    filters: opts.filters,
    verified,
    pending,
    questions,
    q7Sets,
    topCombos,
  };
}

/** Volby otázky v pořadí pro graf (SPEC §4.4: pořadí podle možností). U Q1 pásma. */
export function chartOrder(file: QuestionsFile, qid: QuestionId): { key: string; label: string }[] {
  const q = file.questions.find((x) => x.id === qid)!;
  if (q.type === "slider")
    return [...file.q1_bands.map((b) => ({ key: b.id, label: b.label })), ...q.options.map((o) => ({ key: o.id, label: o.label }))];
  return q.options.map((o) => ({ key: o.id, label: o.label }));
}
