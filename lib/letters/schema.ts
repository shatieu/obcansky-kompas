import { z } from "zod";

/** Zod schémata pro content/letters/*.yaml (SPEC §9.2). */

export const ADDRESSEE_TYPES = ["poslanec", "senator", "kraj", "obec", "ministr-kultury", "prezident"] as const;
export type AddresseeType = (typeof ADDRESSEE_TYPES)[number];

/** Adresát je jedna osoba (oslovení a shoda podle pohlaví), ne sbor (zastupitelstvo). */
export const PERSON_TYPES = ["poslanec", "senator", "ministr-kultury", "prezident"] as const;
export type PersonType = (typeof PERSON_TYPES)[number];
export const isPersonType = (t: AddresseeType): t is PersonType => (PERSON_TYPES as readonly string[]).includes(t);

/** Pohlaví adresáta jako v data/directories (`pohlavi`): M = muž, Z = žena. */
export type Gender = "M" | "Z";

export const POSITIONS = ["osloveni", "uvod", "prechod", "zadost", "zaver"] as const;
export type Position = (typeof POSITIONS)[number];

/** 1 stručná zpráva · 2 běžný dopis · 3 formální dopis */
export type Forma = 1 | 2 | 3;
/** 1 krátký a zdvořilý · 2 střední · 3 delší a důrazný */
export type Delka = 1 | 2 | 3;
export const LEVELS = [1, 2, 3] as const;

const Level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const Levels = z
  .array(Level)
  .min(1)
  .refine((a) => new Set(a).size === a.length, { message: "Stupně se nesmí opakovat." });

const Str = z.string().trim().min(1);

/**
 * Text podle pohlaví adresáta: `m` (muž), `z` (žena), `n` (pohlaví neznámé – neutrální přeformulování).
 * U oslovení může `n` chybět – pak se použije společné `osloveni_neutralni`.
 */
export const GenderedTextSchema = z.object({ m: Str, z: Str, n: Str.optional() }).strict();
export type GenderedText = z.infer<typeof GenderedTextSchema>;
export const LetterTextSchema = z.union([Str, GenderedTextSchema]);
export type LetterText = z.infer<typeof LetterTextSchema>;

export const VariantSchema = z
  .object({
    id: z.string().min(1),
    forma: Levels,
    delka: Levels,
    text: LetterTextSchema,
  })
  .strict();
export type Variant = z.infer<typeof VariantSchema>;

/** Všechna znění textu (prostý text, nebo m/z/n). */
export const textForms = (t: LetterText): string[] => (typeof t === "string" ? [t] : [t.m, t.z, ...(t.n ? [t.n] : [])]);

/**
 * Dvojznačné tvary, které do dopisu konkrétnímu člověku nepatří: „nepodepsal/a“, „poslanec/kyně“,
 * „byl(a)“ a dvojice oslovení „paní poslankyně, pane poslanče“.
 */
export const AMBIGUOUS_GENDER_RE = /\p{L}\/\p{L}|\p{L}\((a|ka|kyně|y)\)|\bpaní\s+\p{L}+,\s*(\p{L}+\s+)?pane\b/iu;

/** Pozice má 3–5 variant s unikátním id i textem. */
const VariantList = z
  .array(VariantSchema)
  .min(3)
  .max(5)
  .superRefine((list, ctx) => {
    const ids = new Set<string>();
    const texts = new Set<string>();
    for (const v of list) {
      const key = JSON.stringify(v.text);
      if (ids.has(v.id)) ctx.addIssue({ code: "custom", message: `Duplicitní id varianty "${v.id}".` });
      if (texts.has(key)) ctx.addIssue({ code: "custom", message: `Duplicitní text varianty "${v.id}".` });
      ids.add(v.id);
      texts.add(key);
    }
  });

export const LetterTypeSchema = z
  .object({
    type: z.enum(ADDRESSEE_TYPES),
    version: z.number().int().min(1),
    label: z.string().trim().min(1),
    /** Funkce do adresy podle pohlaví (jen u jedné osoby), např. poslanec / poslankyně. */
    funkce: z.object({ m: Str, z: Str }).strict().optional(),
    positions: z
      .object({
        osloveni: VariantList,
        uvod: VariantList,
        prechod: VariantList,
        zadost: VariantList,
        zaver: VariantList,
      })
      .strict(),
  })
  .strict();
export type LetterType = z.infer<typeof LetterTypeSchema>;

const LevelLabel = z.object({ level: Level, label: z.string().trim().min(1) }).strict();

export const LetterCommonSchema = z
  .object({
    version: z.number().int().min(1),
    forma_levels: z.array(LevelLabel).length(3),
    delka_levels: z.array(LevelLabel).length(3),
    process_block: z
      .object({
        title: z.string().trim().min(1),
        variants: z.array(VariantSchema).min(1),
      })
      .strict(),
    footer: z.string().trim().min(1),
    /** Oslovení jedné osoby, když neznáme její pohlaví. */
    osloveni_neutralni: Str,
  })
  .strict();
export type LetterCommon = z.infer<typeof LetterCommonSchema>;

export interface LettersContent {
  common: LetterCommon;
  types: Record<AddresseeType, LetterType>;
}

/**
 * Ověří surová data (např. z YAML): každý typ adresáta právě jednou a pro každou
 * kombinaci forma × délka existuje v každé pozici i v bloku o projednávání aspoň jedna varianta.
 */
export function parseLettersContent(raw: { common: unknown; types: unknown[] }): LettersContent {
  const common = LetterCommonSchema.parse(raw.common);
  const parsed = raw.types.map((t) => LetterTypeSchema.parse(t));
  const errors: string[] = [];
  const types = {} as Record<AddresseeType, LetterType>;
  for (const t of parsed) {
    if (types[t.type]) errors.push(`typ "${t.type}" je definován vícekrát`);
    types[t.type] = t;
  }
  for (const type of ADDRESSEE_TYPES) if (!types[type]) errors.push(`chybí typ adresáta "${type}"`);

  // Pohlaví: jedna osoba = oslovení podle pohlaví, funkce v adrese; sbor = jen prostý text.
  for (const t of parsed) {
    const person = isPersonType(t.type);
    if (person && !t.funkce) errors.push(`${t.type}: chybí funkce (m/z) pro adresu`);
    if (!person && t.funkce) errors.push(`${t.type}: funkce patří jen k adresátovi-osobě`);
    for (const pos of POSITIONS)
      for (const v of t.positions[pos]) {
        const where = `${t.type}/${pos}/${v.id}`;
        if (person && pos === "osloveni" && typeof v.text === "string") errors.push(`${where}: oslovení osoby musí mít tvar m/z`);
        if (!person && typeof v.text !== "string") errors.push(`${where}: zastupitelstvo nemá pohlaví, text musí být prostý`);
        if (typeof v.text !== "string" && pos !== "osloveni" && !v.text.n) errors.push(`${where}: chybí neutrální znění n`);
        for (const form of textForms(v.text)) {
          if (AMBIGUOUS_GENDER_RE.test(form)) errors.push(`${where}: dvojznačný rodový tvar v „${form}“`);
          if (/\{\{|\}\}/.test(form)) errors.push(`${where}: neznámý zástupný symbol v „${form}“`);
        }
      }
  }

  for (const v of common.process_block.variants) {
    if (typeof v.text !== "string" && !v.text.n) errors.push(`process_block/${v.id}: chybí neutrální znění n`);
    for (const form of textForms(v.text)) if (AMBIGUOUS_GENDER_RE.test(form)) errors.push(`process_block/${v.id}: dvojznačný rodový tvar`);
  }
  if (AMBIGUOUS_GENDER_RE.test(common.osloveni_neutralni)) errors.push("osloveni_neutralni: dvojznačný rodový tvar");

  const covers = (list: Variant[], f: Forma, d: Delka) => list.some((v) => v.forma.includes(f) && v.delka.includes(d));
  for (const f of LEVELS)
    for (const d of LEVELS) {
      if (!covers(common.process_block.variants, f, d)) errors.push(`process_block: chybí varianta pro forma ${f}, délka ${d}`);
      for (const t of parsed)
        for (const pos of POSITIONS)
          if (!covers(t.positions[pos], f, d)) errors.push(`${t.type}/${pos}: chybí varianta pro forma ${f}, délka ${d}`);
    }

  if (errors.length) throw new Error(`Neplatný obsah dopisů:\n- ${errors.join("\n- ")}`);
  return { common, types };
}
