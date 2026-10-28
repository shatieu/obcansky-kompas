import { z } from "zod";

/** Zod schémata pro content/letters/*.yaml (SPEC §9.2). */

export const ADDRESSEE_TYPES = ["poslanec", "senator", "kraj", "obec", "ministr-kultury", "prezident"] as const;
export type AddresseeType = (typeof ADDRESSEE_TYPES)[number];

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

export const VariantSchema = z
  .object({
    id: z.string().min(1),
    forma: Levels,
    delka: Levels,
    text: z.string().trim().min(1),
  })
  .strict();
export type Variant = z.infer<typeof VariantSchema>;

/** Pozice má 3–5 variant s unikátním id i textem. */
const VariantList = z
  .array(VariantSchema)
  .min(3)
  .max(5)
  .superRefine((list, ctx) => {
    const ids = new Set<string>();
    const texts = new Set<string>();
    for (const v of list) {
      if (ids.has(v.id)) ctx.addIssue({ code: "custom", message: `Duplicitní id varianty "${v.id}".` });
      if (texts.has(v.text)) ctx.addIssue({ code: "custom", message: `Duplicitní text varianty "${v.id}".` });
      ids.add(v.id);
      texts.add(v.text);
    }
  });

export const LetterTypeSchema = z
  .object({
    type: z.enum(ADDRESSEE_TYPES),
    version: z.number().int().min(1),
    label: z.string().trim().min(1),
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
