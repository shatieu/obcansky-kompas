import { MAX_REROLLS, NAME_MAX, POSES, SIGN_COLORS, SLOGAN_MAX, U32_MAX, type ModerationStatus, type Pose, type SignColor } from "@/lib/demo/constants";

/**
 * Stav průvodce připojením k demonstraci (SPEC-demonstrace §3). Čisté funkce bez Reactu,
 * pokryté testy: kroky, validace kroku, „Jiný panáček“ s limitem 20 změn, tělo požadavku.
 * Kontrolu obsahu volných textů (scriptCheck) dodá volající jako funkci, aby šla v testu nahradit.
 */
export const STEPS = ["slogan", "pose", "color", "look", "name", "consent"] as const;
export type Step = (typeof STEPS)[number];

export interface JoinDraft {
  /** "preset" = předvolba (presetId), "custom" = vlastní text. */
  sloganMode: "preset" | "custom";
  presetId: string;
  custom: string;
  pose: Pose;
  signColor: SignColor;
  seed: number;
  rerollCount: number;
  /** false = „Připojit se anonymně“ (výchozí). */
  showName: boolean;
  firstName: string;
  consent: boolean;
}

/** Stav vlastních textů u úpravy (štítky „Čeká na kontrolu“ / „Text neprošel kontrolou“). */
export interface OwnStatus {
  sloganStatus: ModerationStatus;
  nameStatus: ModerationStatus;
}

export type CheckText = (text: string, field: "slogan" | "name") => boolean;

export type StepError = "slogan_empty" | "moderation_slogan" | "name_empty" | "moderation_name" | "consent" | null;

/** Náhodný 32bit seed z crypto (v testu lze dodat vlastní zdroj). */
export function randomSeed(rand: () => number = cryptoU32): number {
  return rand() >>> 0;
}

function cryptoU32(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0]!;
}

export function initialDraft(defaultPresetId: string, seed: number): JoinDraft {
  return {
    sloganMode: "preset",
    presetId: defaultPresetId,
    custom: "",
    pose: POSES[0],
    signColor: SIGN_COLORS[0],
    seed: seed >>> 0,
    rerollCount: 0,
    showName: false,
    firstName: "",
    consent: false,
  };
}

/** Předvyplnění úpravy z GET /api/demonstrace/[id] (own). Souhlas se musí dát znovu. */
export function draftFromOwn(
  p: { seed: number; pose: Pose; signColor: SignColor },
  own: { sloganPresetId: string | null; sloganCustom: string | null; firstName: string | null; rerollCount: number },
  defaultPresetId: string,
): JoinDraft {
  const custom = own.sloganCustom ?? "";
  return {
    sloganMode: custom ? "custom" : "preset",
    presetId: own.sloganPresetId ?? defaultPresetId,
    custom,
    pose: p.pose,
    signColor: p.signColor,
    seed: p.seed >>> 0,
    rerollCount: Math.min(Math.max(0, own.rerollCount), MAX_REROLLS),
    showName: Boolean(own.firstName),
    firstName: own.firstName ?? "",
    consent: false,
  };
}

export const canReroll = (d: Pick<JoinDraft, "rerollCount">) => d.rerollCount < MAX_REROLLS;
export const rerollsLeft = (d: Pick<JoinDraft, "rerollCount">) => Math.max(0, MAX_REROLLS - d.rerollCount);

/** „Jiný panáček“: nový seed, max. 20 změn – pak zůstane poslední (vrátí stejný objekt). */
export function reroll(d: JoinDraft, rand?: () => number): JoinDraft {
  if (!canReroll(d)) return d;
  let seed = randomSeed(rand);
  if (seed === d.seed) seed = (seed + 1) >>> 0;
  return { ...d, seed: Math.min(seed, U32_MAX), rerollCount: d.rerollCount + 1 };
}

/** Jednotné ořezání mezer (jako server: víc mezer → jedna, okraje pryč). */
export const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Text na ceduli pro náhled: vlastní (i neschválený – vidí ho jen autor) nebo předvolba. */
export function signText(d: JoinDraft, presets: Record<string, string>): string {
  if (d.sloganMode === "custom" && tidy(d.custom)) return tidy(d.custom);
  return presets[d.presetId] ?? "";
}

/** Chyba kroku, nebo null. Kroky bez vstupu (póza, barva, vzhled) jsou vždy v pořádku. */
export function stepError(step: Step, d: JoinDraft, check: CheckText): StepError {
  if (step === "slogan") {
    if (d.sloganMode === "preset") return d.presetId ? null : "slogan_empty";
    const t = tidy(d.custom);
    if (!t) return "slogan_empty";
    if (Array.from(t).length > SLOGAN_MAX || !check(t, "slogan")) return "moderation_slogan";
    return null;
  }
  if (step === "name") {
    if (!d.showName) return null;
    const t = tidy(d.firstName);
    if (!t) return "name_empty";
    if (Array.from(t).length > NAME_MAX || !check(t, "name")) return "moderation_name";
    return null;
  }
  if (step === "consent") return d.consent ? null : "consent";
  return null;
}

/** První krok s chybou (pro odeslání z libovolného kroku), nebo null. */
export function firstInvalid(d: JoinDraft, check: CheckText): { step: Step; error: Exclude<StepError, null> } | null {
  for (const step of STEPS) {
    const error = stepError(step, d, check);
    if (error) return { step, error };
  }
  return null;
}

export const stepIndex = (s: Step) => STEPS.indexOf(s);
export const nextStep = (s: Step): Step | null => STEPS[stepIndex(s) + 1] ?? null;
export const prevStep = (s: Step): Step | null => STEPS[stepIndex(s) - 1] ?? null;
export const isStep = (v: unknown): v is Step => typeof v === "string" && (STEPS as readonly string[]).includes(v);

export type NavState = "done" | "current" | "todo";

/** Stav segmentů navigace: navštívené a bez chyby = hotovo. Volná navigace mezi kroky. */
export function navStates(current: Step, visited: ReadonlySet<Step>, d: JoinDraft, check: CheckText): NavState[] {
  return STEPS.map((s) => (s === current ? "current" : visited.has(s) && !stepError(s, d, check) ? "done" : "todo"));
}

/** Tělo POST /api/demonstrace/join i PATCH /api/demonstrace/[id]. */
export function payload(d: JoinDraft) {
  const custom = d.sloganMode === "custom" ? tidy(d.custom) : "";
  const name = d.showName ? tidy(d.firstName) : "";
  return {
    ...(custom ? { sloganCustom: custom } : { sloganPresetId: d.presetId }),
    pose: d.pose,
    signColor: d.signColor,
    seed: d.seed >>> 0,
    rerollCount: Math.min(d.rerollCount, MAX_REROLLS),
    firstName: name || null,
    consent: true as const,
  };
}

/**
 * Ukázat štítek stavu jen u textu, který se od uloženého nezměnil (u nového textu stav ještě neplatí).
 */
export function visibleStatus(status: ModerationStatus, saved: string | null, current: string): "pending" | "rejected" | null {
  if (!saved || tidy(current) !== saved) return null;
  return status === "pending" || status === "rejected" ? status : null;
}
