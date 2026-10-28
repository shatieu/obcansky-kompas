import { z } from "zod";
import { evaluate, isAnswered } from "@/lib/compose/engine";
import { QUESTION_IDS, type Answers, type QuestionId } from "@/lib/compose/types";
import type { QuestionsFile } from "@/lib/content/schemas";
import { validateAnswers } from "@/lib/sign/input";

/**
 * Validace pozvánky (`pnpm org:invite`) a odeslání formuláře /org/[token] (SPEC §12, §14.3).
 * Čisté funkce, testované bez DB.
 */

export const ORG_TYPES = ["strana", "hnuti", "iniciativa"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_NAME_MAX = 200;
export const ORG_CONTACT_MAX = 300;
export const JUSTIFICATION_MAX = 300;

/** Token z randomToken(): 32 B base64url = 43 znaků. */
export const ORG_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const inviteInputSchema = z.object({
  name: z.string().trim().min(1, "name").max(ORG_NAME_MAX, "name"),
  type: z.enum(ORG_TYPES, "type"),
  contact: z.string().trim().min(1, "contact").max(ORG_CONTACT_MAX, "contact"),
});
export type InviteInput = z.infer<typeof inviteInputSchema>;

/** Řídicí a neviditelné znaky směru textu (kromě konce řádku): C0, DEL, U+200B–200F, U+202A–202E, U+2066–2069. */
const range = (a: number, b: number) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const INVISIBLE_RE = new RegExp(
  `[${range(0x00, 0x09)}${range(0x0b, 0x1f)}${String.fromCharCode(0x7f)}${range(0x200b, 0x200f)}${range(0x202a, 0x202e)}${range(0x2066, 0x2069)}]`,
  "g",
);

/** Odstraní řídicí znaky (kromě konce řádku), sjednotí konce řádků a ořízne okraje. */
export function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const submitInputSchema = z.object({
  token: z.string().regex(ORG_TOKEN_RE, "token"),
  answers: z.record(z.string(), z.unknown()),
  justifications: z.record(z.string(), z.string().max(JUSTIFICATION_MAX * 2)).optional().default({}),
  confirm: z.literal(true, "confirm"),
});

export type SubmitFailure = "token" | "confirm" | "answers" | "justifications" | "invalid";

export type ParsedSubmit =
  | { ok: true; token: string; answers: Answers; justifications: Partial<Record<QuestionId, string>> }
  | { ok: false; reason: SubmitFailure };

/**
 * Celé odeslání: zod → odpovědi proti aktuálním otázkám (efektivní, vč. předvyplněných,
 * stejně jako podpis) → odůvodnění jen k otázkám, které platí, max. 300 znaků po očištění.
 */
export function parseSubmit(body: unknown, questions: QuestionsFile): ParsedSubmit {
  const p = submitInputSchema.safeParse(body);
  if (!p.success) {
    const k = p.error.issues[0]?.path[0];
    if (k === "token" || k === "confirm" || k === "answers" || k === "justifications") return { ok: false, reason: k };
    return { ok: false, reason: "invalid" };
  }
  const a = validateAnswers(p.data.answers, questions);
  if (!a.ok) return { ok: false, reason: "answers" };
  const { states } = evaluate(a.answers, questions);
  const justifications: Partial<Record<QuestionId, string>> = {};
  for (const [key, raw] of Object.entries(p.data.justifications)) {
    if (!QUESTION_IDS.includes(key as QuestionId)) return { ok: false, reason: "justifications" };
    const qid = key as QuestionId;
    const text = cleanText(raw);
    if (!text) continue;
    if ([...text].length > JUSTIFICATION_MAX) return { ok: false, reason: "justifications" };
    // Odůvodnění k odpadlé otázce nemá k čemu patřit – tiše se vynechá.
    if (states[qid].status === "skipped") continue;
    justifications[qid] = text;
  }
  // Odůvodnění bez odpovědi je v pořádku (subjekt může vysvětlit, proč neodpověděl), ale
  // aspoň jedna odpověď musí být (validateAnswers to už hlídá).
  if (!QUESTION_IDS.some((q) => isAnswered(a.answers[q]))) return { ok: false, reason: "answers" };
  return { ok: true, token: p.data.token, answers: a.answers, justifications };
}
