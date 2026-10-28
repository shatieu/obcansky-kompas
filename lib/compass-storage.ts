import { questionsFile } from "@/lib/content";
import { evaluate } from "@/lib/compose/engine";
import { QUESTION_IDS, type Answers, type AnswerValue, type Demographics, type QuestionId } from "@/lib/compose/types";

/**
 * Stav kompasu v prohlížeči (SPEC §5.4). Vše v try/catch – localStorage může chybět
 * (soukromý režim, zákaz cookies). Čte ho i /kompas/podpis a /akce.
 */
export const STORAGE_KEY = "obcansky-kompas:v1";

export interface CompassState {
  answers: Answers;
  demographics: Demographics;
  /** Otázky, jejichž odpověď zrušila změna dřívější volby (zvýrazní se). */
  invalidated: QuestionId[];
  hideUnknown: boolean;
  /** Jestli uživatel u Q1 pohnul posuvníkem (jinak se hodnota neukládá). */
  updatedAt?: string;
}

export const emptyState = (): CompassState => ({ answers: {}, demographics: {}, invalidated: [], hideUnknown: false });

/**
 * Změna jedné odpovědi (krok otázky i přehled odpovědí). Větvení se přepočítá hned: odpovědi,
 * které změna zrušila, zmizí a jejich otázky se přidají do `invalidated` (zvýrazní se, SPEC §5.2).
 * Nová odpověď na otázku zvýraznění u ní zruší.
 */
export function applyAnswer(s: CompassState, qid: QuestionId, value: AnswerValue | undefined): CompassState {
  const answers: Answers = { ...s.answers };
  if (value === undefined || (Array.isArray(value) && value.length === 0)) delete answers[qid];
  else answers[qid] = value;
  const ev = evaluate(answers, questionsFile);
  const invalidated = new Set(s.invalidated.filter((q) => q !== qid));
  for (const q of ev.invalidated) invalidated.add(q);
  return { ...s, answers: ev.cleaned, invalidated: QUESTION_IDS.filter((q) => invalidated.has(q)) };
}

export function loadCompassState(): CompassState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<CompassState>;
    return {
      answers: parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {},
      demographics: parsed.demographics && typeof parsed.demographics === "object" ? parsed.demographics : {},
      invalidated: Array.isArray(parsed.invalidated) ? parsed.invalidated : [],
      hideUnknown: parsed.hideUnknown === true,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return emptyState();
  }
}

export function saveCompassState(state: CompassState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
  } catch {
    /* úložiště nedostupné – kompas funguje dál jen v paměti */
  }
}

export function clearCompassState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nic */
  }
}
