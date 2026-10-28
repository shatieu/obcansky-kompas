import { z } from "zod";
import { evaluate, isAnswered } from "@/lib/compose/engine";
import { round1 } from "@/lib/compose/q1";
import { QUESTION_IDS, type Answers, type QuestionId } from "@/lib/compose/types";
import type { QuestionsFile } from "@/lib/content/schemas";

/**
 * Validace vstupu podpisu (SPEC §7.1, §14.3). Čisté funkce – testované bez DB.
 */

export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const ADDRESS_MAX = 200;

const trimmed = (max: number) => z.string().trim().max(max);
/** Nepovinný text: chybějící, null i prázdný = null (normalizuje `clean`). */
const optionalText = (max: number) => z.string().trim().max(max).nullish();

export function signInputSchema(questions: QuestionsFile) {
  const d = questions.demographics;
  const oneOf = (ids: string[]) =>
    z
      .string()
      .nullish()
      .refine((v) => !v || ids.includes(v), "neznámá hodnota");
  return z.object({
    name: trimmed(NAME_MAX).min(1, "name"),
    email: z.string().trim().max(EMAIL_MAX).pipe(z.email("email")),
    showName: z.boolean().optional().default(false),
    address: optionalText(ADDRESS_MAX),
    consent: z.literal(true, "consent"),
    answers: z.record(z.string(), z.unknown()),
    comment: optionalText(d.comment_max),
    region: oneOf(d.regions.map((r) => r.id)),
    ageGroup: oneOf(d.age_groups.map((r) => r.id)),
    municipalitySize: oneOf(d.municipality_sizes.map((r) => r.id)),
    turnstileToken: z.string().optional(),
  });
}

export type SignInput = z.infer<ReturnType<typeof signInputSchema>>;

/** Prázdné / chybějící nepovinné hodnoty → null. */
export const clean = (v: string | null | undefined): string | null => (v ? v : null);

/** Pole, které validace odmítla (pro hlášku ve formuláři) – nikdy neobsahuje hodnotu. */
export function failedField(error: z.ZodError): "name" | "email" | "consent" | "comment" | "answers" | null {
  for (const i of error.issues) {
    const k = i.path[0];
    if (k === "name" || k === "email" || k === "consent" || k === "comment" || k === "answers") return k;
  }
  return null;
}

export type AnswersResult = { ok: true; answers: Answers } | { ok: false };

/**
 * Ověří odpovědi proti aktuálním otázkám a vrátí efektivní odpovědi (vč. předvyplněných,
 * DECISIONS: „Do podpisu a statistik se ukládají efektivní odpovědi“). Neznámé klíče,
 * neznámé volby a částky mimo rozsah = chyba. Volby zrušené větvením se tiše vynechají.
 */
export function validateAnswers(raw: Record<string, unknown>, questions: QuestionsFile): AnswersResult {
  const answers: Answers = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (!QUESTION_IDS.includes(key as QuestionId)) return { ok: false };
    const qid = key as QuestionId;
    const q = questions.questions.find((x) => x.id === qid);
    if (!q) return { ok: false };
    const ids = new Set(q.options.map((o) => o.id));
    if (q.type === "slider") {
      if (typeof value === "number") {
        if (!Number.isFinite(value) || !q.slider || value < q.slider.min || value > q.slider.max) return { ok: false };
        answers[qid] = round1(value);
      } else if (typeof value === "string" && ids.has(value)) answers[qid] = value;
      else return { ok: false };
    } else if (q.type === "single") {
      if (typeof value !== "string" || !ids.has(value)) return { ok: false };
      answers[qid] = value;
    } else {
      if (!Array.isArray(value) || value.length === 0 || value.length > ids.size) return { ok: false };
      if (!value.every((v): v is string => typeof v === "string" && ids.has(v))) return { ok: false };
      answers[qid] = [...new Set(value)];
    }
  }
  const { effective } = evaluate(answers, questions);
  if (!QUESTION_IDS.some((q) => isAnswered(effective[q]))) return { ok: false };
  return { ok: true, answers: effective };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Token z randomToken(): 32 B base64url = 43 znaků. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
