import type { Effect, QuestionsFile } from "@/lib/content/schemas";
import type { Answers, AnswerValue, QuestionId } from "./types";

/**
 * Větvení kompasu (SPEC §5.2). Pravidla jsou data v questions.yaml. Čistá funkce:
 * z uživatelových odpovědí spočítá stav každé otázky, efektivní odpovědi
 * (vč. předvyplněných) a seznam otázek, jejichž odpověď kvůli změně dřívější volby neplatí.
 */

export interface Cause {
  ruleId: string;
  question: QuestionId;
  option: string;
}

export interface QuestionState {
  id: QuestionId;
  /** skipped = celá otázka zašedlá (nelze odpovědět). */
  status: "open" | "skipped";
  skippedBy?: Cause;
  /** Zašedlé volby a proč. */
  disabled: Record<string, Cause>;
  /** Jediná povolená volba – předvyplní se. */
  forced?: string;
  forcedBy?: Cause;
}

export interface Evaluation {
  states: Record<QuestionId, QuestionState>;
  /** Odpovědi, které platí (uživatelovy platné + předvyplněné). Odpadlé otázky chybí. */
  effective: Answers;
  /** Uživatelovy odpovědi očištěné o neplatné (bez předvyplněných) – to se ukládá. */
  cleaned: Answers;
  /** Otázky, kde uživatel měl odpověď, která teď neplatí. */
  invalidated: QuestionId[];
}

function matches(value: AnswerValue | undefined, option: string): boolean {
  if (value === undefined) return false;
  return Array.isArray(value) ? value.includes(option) : value === option;
}

export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function evaluate(answers: Answers, file: QuestionsFile): Evaluation {
  const states = {} as Record<QuestionId, QuestionState>;
  const effective: Answers = {};
  const cleaned: Answers = {};
  const invalidated: QuestionId[] = [];

  for (const q of file.questions) {
    const qid = q.id as QuestionId;
    const state: QuestionState = { id: qid, status: "open", disabled: {} };
    const optionIds = q.options.map((o) => o.id);

    for (const rule of file.rules) {
      const eff: Effect | undefined = rule.effects[qid];
      if (!eff) continue;
      const whenQ = rule.when.question as QuestionId;
      if (!matches(effective[whenQ], rule.when.option)) continue;
      const cause: Cause = { ruleId: rule.id, question: whenQ, option: rule.when.option };
      if ("skip" in eff) {
        state.status = "skipped";
        state.skippedBy ??= cause;
      } else if ("only" in eff) {
        for (const o of optionIds) if (!eff.only.includes(o)) state.disabled[o] ??= cause;
      } else {
        for (const o of eff.disable) state.disabled[o] ??= cause;
      }
    }
    if (state.status === "skipped") {
      state.disabled = Object.fromEntries(optionIds.map((o) => [o, state.skippedBy!]));
    } else if (q.type !== "slider") {
      const allowed = optionIds.filter((o) => !state.disabled[o]);
      if (allowed.length === 1) {
        state.forced = allowed[0];
        state.forcedBy = Object.values(state.disabled)[0];
      }
    }
    states[qid] = state;

    const forcedValue = (): AnswerValue | undefined =>
      state.forced ? (q.type === "multi" ? [state.forced] : state.forced) : undefined;

    const raw = answers[qid];
    if (!isAnswered(raw)) {
      const f = forcedValue();
      if (f !== undefined) effective[qid] = f;
      continue;
    }

    let valid: AnswerValue | undefined;
    let partiallyInvalid = false;
    if (state.status === "skipped") valid = undefined;
    else if (q.type === "slider") {
      if (typeof raw === "number" && Number.isFinite(raw)) {
        const s = q.slider!;
        valid = Math.round(Math.min(s.max, Math.max(s.min, raw)) * 10) / 10;
      } else if (typeof raw === "string" && optionIds.includes(raw)) valid = raw;
    } else if (q.type === "multi") {
      const input = Array.isArray(raw) ? raw : [raw];
      const list = input.filter(
        (o): o is string => typeof o === "string" && optionIds.includes(o) && !state.disabled[o],
      );
      const exclusive = q.options.filter((o) => o.exclusive).map((o) => o.id);
      const ex = list.find((o) => exclusive.includes(o));
      const normalised = ex ? [ex] : [...new Set(list)].sort((a, b) => optionIds.indexOf(a) - optionIds.indexOf(b));
      valid = normalised.length ? normalised : undefined;
      partiallyInvalid = list.length !== input.length;
    } else if (typeof raw === "string" && optionIds.includes(raw) && !state.disabled[raw]) valid = raw;

    if (valid === undefined) {
      invalidated.push(qid);
      const f = forcedValue();
      if (f !== undefined) effective[qid] = f;
      continue;
    }
    if (partiallyInvalid) invalidated.push(qid);
    cleaned[qid] = valid;
    effective[qid] = valid;
  }
  return { states, effective, cleaned, invalidated };
}

/** Id volby „Nevím“ dané otázky. */
export function nevimId(file: QuestionsFile, qid: QuestionId): string {
  return file.questions.find((q) => q.id === qid)!.options.find((o) => o.nevim)!.id;
}

export function isNevim(file: QuestionsFile, qid: QuestionId, value: AnswerValue | undefined): boolean {
  const n = nevimId(file, qid);
  return Array.isArray(value) ? value.length === 1 && value[0] === n : value === n;
}
