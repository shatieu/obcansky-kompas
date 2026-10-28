import {
  fromCompassAnswers,
  normalizeAnswers,
  type Adjustment,
  type Answers,
  type CompassAnswers,
  type EffectiveAnswers,
  type EffectiveValue,
  type QuestionId,
} from "./answers";
import type { Condition, LawContent, LegalReview, Paragraph, When } from "./schema";

/* ------------------------------------------------------------------ types */

export interface LawPoint {
  /** „a)“, „b)“ … */
  label: string;
  text: string;
}

export interface LawSubsection {
  /** „(1)“, „(2)“ … ; null, když má paragraf jen jeden odstavec */
  label: string | null;
  text: string;
  points: LawPoint[];
}

export interface LawParagraph {
  /** Pořadové číslo paragrafu (dopočítané). */
  number: number;
  /** „§ 3“ */
  label: string;
  id: string;
  /** id modulu, „base“ nebo „compatibility“ */
  source: string;
  slot: string | null;
  title: string | null;
  subsections: LawSubsection[];
  /** Paragraf obsahuje jen text pro „Nevím“ nebo poznámku o rozporu. */
  isPlaceholder: boolean;
}

export interface LawPart {
  id: string;
  number: number;
  /** „HLAVA I“ */
  label: string;
  title: string;
  paragraphs: LawParagraph[];
}

export interface LawModuleRef {
  id: string;
  version: number;
  legalReview: LegalReview;
}

export interface LawHeader {
  title: string;
  lawTitle: string;
  contentVersion: string;
  date: string;
  uuid: string;
  modules: LawModuleRef[];
  compatibilityVersion: number;
  labels: {
    modules: string;
    date: string;
    id: string;
    contentVersion: string;
  };
}

export interface LawDocument {
  header: LawHeader;
  heading: string[];
  enactingFormula: string;
  parts: LawPart[];
  /** Všechny použité moduly (vč. základu) mají legal_review: approved. */
  allApproved: boolean;
  /** „Pracovní verze, neprověřeno právníkem“, dokud allApproved není true; jinak null. */
  workingDraftLabel: string | null;
  /** Vždy zobrazované upozornění. */
  disclaimer: string;
  effectiveAnswers: EffectiveAnswers;
  adjustments: Adjustment[];
  appliedRules: string[];
}

export interface ComposeLawOptions {
  content: LawContent;
  /** Datum sestavení pro hlavičku (např. „28. 10. 2026“). Bez něj zástupný text z base.yaml. */
  date?: string;
  /** UUID podpisu pro hlavičku. Bez něj zástupný text z base.yaml. */
  uuid?: string;
}

/* -------------------------------------------------------------- conditions */

function matchCondition(value: EffectiveValue, cond: Condition): boolean {
  if (value === "omitted") return false;
  if (cond === "nevim") return value === "nevim";
  if (cond === "answered") return value !== "nevim";
  if (value === "nevim") return false;
  const selected = Array.isArray(value) ? value : [value];
  if (typeof cond === "number") return selected.includes(cond);
  if (Array.isArray(cond)) return cond.some((c) => selected.includes(c));
  const not = Array.isArray(cond.not) ? cond.not : [cond.not];
  return !not.some((c) => selected.includes(c));
}

export function matchWhen(when: When | undefined, eff: EffectiveAnswers): boolean {
  if (!when) return true;
  for (const [key, cond] of Object.entries(when)) {
    if (key === "any") {
      const alts = cond as When[];
      if (!alts.some((w) => matchWhen(w, eff))) return false;
    } else if (cond !== undefined) {
      if (!matchCondition(eff[key as QuestionId], cond as Condition)) return false;
    }
  }
  return true;
}

/* ---------------------------------------------------------- compatibility */

export interface CompatibilityResult {
  effective: EffectiveAnswers;
  adjustments: Adjustment[];
  appliedRules: string[];
  /** slot → náhradní paragraf */
  replacements: Map<string, Paragraph>;
}

function sameValue(a: EffectiveValue, b: EffectiveValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Aplikuje matici kompatibility. `scope: "compass"` použije jen pravidla větvení (allow, grey),
 * `scope: "law"` navíc law_omit a law_replace.
 */
export function applyCompatibility(
  input: EffectiveAnswers,
  compatibility: LawContent["compatibility"],
  scope: "compass" | "law" = "law",
): CompatibilityResult {
  const effective: EffectiveAnswers = { ...input };
  const adjustments: Adjustment[] = [];
  const appliedRules: string[] = [];
  const replacements = new Map<string, Paragraph>();

  const set = (q: QuestionId, to: EffectiveValue, reason: string) => {
    const from = effective[q];
    if (sameValue(from, to)) return;
    effective[q] = to;
    adjustments.push({ question: q, from, to, reason });
  };

  for (const rule of compatibility.rules) {
    if (scope === "compass" && rule.origin !== "spec-5.2") continue;
    if (!matchWhen(rule.when, effective)) continue;
    appliedRules.push(rule.id);

    for (const [q, allowed] of Object.entries(rule.allow ?? {}) as [QuestionId, (number | "nevim")[] | undefined][]) {
      if (!allowed) continue;
      const cur = effective[q];
      if (cur === "omitted" || Array.isArray(cur)) continue;
      if (allowed.includes(cur)) continue;
      const only = allowed.length === 1 ? allowed[0]! : "nevim";
      set(q, only, rule.id);
    }
    for (const q of rule.grey ?? []) set(q, "omitted", rule.id);
    if (scope === "law") {
      for (const q of rule.law_omit ?? []) set(q, "omitted", rule.id);
      if (rule.law_replace) replacements.set(rule.law_replace.slot, rule.law_replace.paragraph);
    }
  }
  return { effective, adjustments, appliedRules, replacements };
}

/* -------------------------------------------------------------- rendering */

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
export function toRoman(n: number): string {
  let out = "";
  let rest = n;
  for (const [v, s] of ROMAN) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
function pointLabel(i: number): string {
  return `${LETTERS[i] ?? `${i + 1}`})`;
}

/** 9.2 → „9 200 000 000 Kč“ (s nezlomitelnými mezerami). */
export function formatAmountCzk(mld: number): string {
  const kc = Math.round(mld * 1000) * 1_000_000;
  return `${kc.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
}

interface Draft {
  id: string;
  source: string;
  slot: string | null;
  title: string | null;
  subsections: { text: string; points: string[] }[];
  isPlaceholder: boolean;
}

const NEVIM_ONLY = /^\s*\{\{\s*nevim\s*\}\}\s*$/;

function draftParagraph(p: Paragraph, source: string, slot: string | null, eff: EffectiveAnswers, forcePlaceholder = false): Draft | null {
  if (!matchWhen(p.when, eff)) return null;
  const subs = p.subsections ?? [{ text: p.text! }];
  const out: Draft["subsections"] = [];
  for (const s of subs) {
    if (!matchWhen(s.when, eff)) continue;
    let points: string[] = [];
    if (s.points) {
      points = s.points
        .filter((pt) => typeof pt === "string" || matchWhen(pt.when, eff))
        .map((pt) => (typeof pt === "string" ? pt : pt.text));
      if (points.length === 0) continue;
    }
    out.push({ text: s.text, points });
  }
  if (out.length === 0) return null;
  const isPlaceholder = forcePlaceholder || (out.length === 1 && NEVIM_ONLY.test(out[0]!.text));
  return { id: p.id, source, slot, title: p.title ?? null, subsections: out, isPlaceholder };
}

function finishPoints(points: string[]): string[] {
  return points.map((raw, i) => {
    const t = raw.trim().replace(/[,.;]+$/, "");
    return i === points.length - 1 ? `${t}.` : `${t},`;
  });
}

/* ---------------------------------------------------------------- compose */

/**
 * Sestaví „Můj zákon“ z odpovědí. Čistá funkce: stejný vstup → stejný výstup.
 * `contentVersion` se jen propisuje do hlavičky (obsah předává volající v `options.content`).
 */
export function composeLaw(answers: Answers, contentVersion: string, options: ComposeLawOptions): LawDocument {
  const { content } = options;
  const { base, modules, compatibility } = content;

  const normalized = normalizeAnswers(answers);
  const compat = applyCompatibility(normalized.effective, compatibility, "law");
  const eff = compat.effective;

  // 1) výběr paragrafů
  const usedModules: LawModuleRef[] = [];
  const usedModuleIds = new Set<string>();
  const partDrafts: { id: string; title: string; drafts: Draft[] }[] = [];

  for (const part of base.parts) {
    const drafts: Draft[] = [];
    for (const item of part.items) {
      if (!("slot" in item)) {
        const d = draftParagraph(item, "base", null, eff);
        if (d) drafts.push(d);
        continue;
      }
      const replacement = compat.replacements.get(item.slot);
      if (replacement) {
        const d = draftParagraph(replacement, "compatibility", item.slot, eff, true);
        if (d) drafts.push(d);
        continue;
      }
      for (const mod of modules.filter((m) => m.slot === item.slot)) {
        let contributed = false;
        for (const p of mod.paragraphs) {
          const d = draftParagraph(p, mod.id, item.slot, eff);
          if (d) {
            drafts.push(d);
            contributed = true;
          }
        }
        if (contributed && !usedModuleIds.has(mod.id)) {
          usedModuleIds.add(mod.id);
          usedModules.push({ id: mod.id, version: mod.version, legalReview: mod.legal_review });
        }
      }
    }
    if (drafts.length) partDrafts.push({ id: part.id, title: part.title, drafts });
  }

  // 2) číslování paragrafů a mapa slot → první paragraf
  const slotFirst = new Map<string, number>();
  let n = 0;
  const numbered = partDrafts.map((pd) => ({
    ...pd,
    drafts: pd.drafts.map((d) => {
      n += 1;
      if (d.slot && !slotFirst.has(d.slot)) slotFirst.set(d.slot, n);
      return { ...d, number: n };
    }),
  }));

  // 3) šablony
  const render = (text: string, where: string): string =>
    text
      .replace(/\{\{\s*([a-z_]+)(?::([a-z0-9_-]+))?\s*\}\}/g, (_m, name: string, arg: string | undefined) => {
        if (name === "nevim") return base.placeholder_nevim;
        if (name === "ref") {
          const num = arg ? slotFirst.get(arg) : undefined;
          return num !== undefined ? `§ ${num}` : base.ref_fallback;
        }
        if (name === "amount") {
          if (typeof eff.q1 !== "number") throw new Error(`${where}: {{amount}} bez odpovědi Q1`);
          return formatAmountCzk(eff.q1);
        }
        throw new Error(`${where}: neznámá šablona {{${name}}}`);
      })
      .replace(/[ \t\r\n]+/g, " ")
      .trim();

  const parts: LawPart[] = numbered.map((pd, i) => ({
    id: pd.id,
    number: i + 1,
    label: `HLAVA ${toRoman(i + 1)}`,
    title: pd.title,
    paragraphs: pd.drafts.map((d) => ({
      number: d.number,
      label: `§ ${d.number}`,
      id: d.id,
      source: d.source,
      slot: d.slot,
      title: d.title,
      isPlaceholder: d.isPlaceholder,
      subsections: d.subsections.map((s, si) => ({
        label: d.subsections.length > 1 ? `(${si + 1})` : null,
        text: render(s.text, d.id),
        points: finishPoints(s.points.map((p) => render(p, d.id))).map((text, pi) => ({ label: pointLabel(pi), text })),
      })),
    })),
  }));

  const moduleRefs: LawModuleRef[] = [
    { id: base.id, version: base.version, legalReview: base.legal_review },
    ...usedModules,
  ];
  const allApproved = moduleRefs.every((m) => m.legalReview === "approved");

  return {
    header: {
      title: base.labels.header_title,
      lawTitle: base.title,
      contentVersion,
      date: options.date ?? base.labels.date_placeholder,
      uuid: options.uuid ?? base.labels.uuid_placeholder,
      modules: moduleRefs,
      compatibilityVersion: compatibility.version,
      labels: {
        modules: base.labels.header_modules,
        date: base.labels.header_date,
        id: base.labels.header_id,
        contentVersion: base.labels.header_content_version,
      },
    },
    heading: base.heading,
    enactingFormula: base.enacting_formula,
    parts,
    allApproved,
    workingDraftLabel: allApproved ? null : base.labels.working_draft,
    disclaimer: base.labels.disclaimer,
    effectiveAnswers: eff,
    adjustments: [...normalized.adjustments, ...compat.adjustments],
    appliedRules: compat.appliedRules,
  };
}

/** Totéž jako composeLaw, ale s odpověďmi ve tvaru kompasu (lib/compose: "q2-opt3", "q1-nevim"…). */
export function composeLawFromCompass(
  answers: CompassAnswers,
  contentVersion: string,
  options: ComposeLawOptions,
): LawDocument {
  return composeLaw(fromCompassAnswers(answers), contentVersion, options);
}

/* -------------------------------------------------------------- plain text */

/** Prostý text zákona (pro náhled, kopírování a testy). */
export function lawToPlainText(doc: LawDocument): string {
  const lines: string[] = [];
  if (doc.workingDraftLabel) lines.push(doc.workingDraftLabel.toUpperCase(), "");
  lines.push(doc.disclaimer, "");
  lines.push(`${doc.header.labels.modules}: ${doc.header.modules.map((m) => `${m.id} v${m.version}`).join(", ")}`);
  lines.push(`${doc.header.labels.contentVersion}: ${doc.header.contentVersion}`);
  lines.push(`${doc.header.labels.date}: ${doc.header.date}`);
  lines.push(`${doc.header.labels.id}: ${doc.header.uuid}`, "");
  lines.push(...doc.heading, "", doc.enactingFormula);
  for (const part of doc.parts) {
    lines.push("", part.label, part.title.toUpperCase());
    for (const p of part.paragraphs) {
      lines.push("", p.label);
      if (p.title) lines.push(p.title);
      for (const s of p.subsections) {
        lines.push(s.label ? `${s.label} ${s.text}` : s.text);
        for (const pt of s.points) lines.push(`${pt.label} ${pt.text}`);
      }
    }
  }
  return lines.join("\n");
}
