/**
 * Odpovědi kompasu tak, jak je skládání zákona očekává (SPEC §5.1).
 *
 * - q1: `{ value }` v mld Kč, nebo "nevim"
 * - q2–q6, q8: index volby (1-based, pořadí přesně podle SPEC §5.1), nebo "nevim"
 *   (index poslední volby „Nevím“ se bere stejně jako "nevim")
 * - q7: pole indexů (1-based), nebo "nevim"
 * Chybějící odpověď = „Nevím“.
 */
export type Nevim = "nevim";

export interface Answers {
  q1?: { value: number } | Nevim;
  q2?: number | Nevim;
  q3?: number | Nevim;
  q4?: number | Nevim;
  q5?: number | Nevim;
  q6?: number | Nevim;
  q7?: number[] | Nevim;
  q8?: number | Nevim;
}

export const QUESTION_IDS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

/** Počet voleb včetně „Nevím“ (Nevím je vždy poslední). q1 je posuvník. */
export const OPTION_COUNT: Record<Exclude<QuestionId, "q1">, number> = {
  q2: 7,
  q3: 4,
  q4: 4,
  q5: 5,
  q6: 4,
  q7: 6,
  q8: 6,
};

/** Q7: volba „Platí všichni“ – vylučuje ostatní. */
export const Q7_EVERYONE_PAYS = 5;

/**
 * Efektivní hodnota odpovědi po normalizaci a po pravidlech kompatibility.
 * number = volba (u q1 částka v mld Kč), number[] = více voleb (q7),
 * "nevim" = Nevím / nezodpovězeno, "omitted" = otázka je zašedlá nebo se do zákona nevkládá.
 */
export type EffectiveValue = number | number[] | Nevim | "omitted";
export type EffectiveAnswers = Record<QuestionId, EffectiveValue>;

export interface Adjustment {
  question: QuestionId;
  from: EffectiveValue;
  to: EffectiveValue;
  /** id pravidla z compatibility.yaml nebo "normalize" */
  reason: string;
}

function normalizeSingle(q: Exclude<QuestionId, "q1" | "q7">, v: unknown, adj: Adjustment[]): EffectiveValue {
  if (v === undefined || v === null || v === "nevim") return "nevim";
  const max = OPTION_COUNT[q];
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max) {
    return v === max ? "nevim" : v;
  }
  adj.push({ question: q, from: "nevim", to: "nevim", reason: "normalize:invalid" });
  return "nevim";
}

export function normalizeAnswers(answers: Answers): { effective: EffectiveAnswers; adjustments: Adjustment[] } {
  const adjustments: Adjustment[] = [];

  let q1: EffectiveValue = "nevim";
  const a1 = answers.q1;
  if (a1 && typeof a1 === "object" && typeof a1.value === "number" && Number.isFinite(a1.value) && a1.value > 0) {
    q1 = a1.value;
  } else if (a1 !== undefined && a1 !== "nevim") {
    adjustments.push({ question: "q1", from: "nevim", to: "nevim", reason: "normalize:invalid" });
  }

  let q7: EffectiveValue = "nevim";
  const a7 = answers.q7;
  if (Array.isArray(a7)) {
    const max = OPTION_COUNT.q7;
    const valid = [...new Set(a7.filter((x) => Number.isInteger(x) && x >= 1 && x <= max))].sort((a, b) => a - b);
    if (valid.length === 0 || valid.includes(max)) {
      q7 = "nevim";
    } else if (valid.includes(Q7_EVERYONE_PAYS) && valid.length > 1) {
      q7 = [Q7_EVERYONE_PAYS];
      adjustments.push({ question: "q7", from: valid, to: q7, reason: "normalize:q7-exclusive" });
    } else {
      q7 = valid;
    }
  }

  return {
    effective: {
      q1,
      q2: normalizeSingle("q2", answers.q2, adjustments),
      q3: normalizeSingle("q3", answers.q3, adjustments),
      q4: normalizeSingle("q4", answers.q4, adjustments),
      q5: normalizeSingle("q5", answers.q5, adjustments),
      q6: normalizeSingle("q6", answers.q6, adjustments),
      q7,
      q8: normalizeSingle("q8", answers.q8, adjustments),
    },
    adjustments,
  };
}

/* ------------------------------------------------------------------------
 * Tenké mapování z odpovědí kompasu (lib/compose/types.ts):
 *   q1: číslo v mld Kč nebo "q1-nevim"; ostatní: "qN-optK" / "qN-nevim"; q7: pole id.
 * Strukturálně kompatibilní typ – lib/law nezávisí na lib/compose.
 * --------------------------------------------------------------------- */
export type CompassAnswers = Partial<Record<QuestionId, string | string[] | number>>;

function optionIndexFromId(q: QuestionId, id: unknown): number | Nevim | undefined {
  if (typeof id !== "string") return undefined;
  if (id === `${q}-nevim`) return "nevim";
  const m = new RegExp(`^${q}-opt([0-9]+)$`).exec(id);
  return m ? Number(m[1]) : undefined;
}

export function fromCompassAnswers(a: CompassAnswers): Answers {
  const out: Answers = {};
  if (typeof a.q1 === "number") out.q1 = { value: a.q1 };
  else if (a.q1 === "q1-nevim") out.q1 = "nevim";
  for (const q of ["q2", "q3", "q4", "q5", "q6", "q8"] as const) {
    const v = optionIndexFromId(q, a[q]);
    if (v !== undefined) out[q] = v;
  }
  if (Array.isArray(a.q7)) {
    const mapped = a.q7.map((id) => optionIndexFromId("q7", id));
    if (mapped.includes("nevim")) out.q7 = "nevim";
    else out.q7 = mapped.filter((x): x is number => typeof x === "number");
  } else if (a.q7 === "q7-nevim") {
    out.q7 = "nevim";
  }
  return out;
}
