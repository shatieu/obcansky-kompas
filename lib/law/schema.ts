import { z } from "zod";
import { QUESTION_IDS, type QuestionId } from "./answers";

/**
 * Zod schémata pro content/law/*.yaml (SPEC §10).
 *
 * Podmínka `when` (WhenSchema) – všechny uvedené klíče musí platit zároveň:
 *   qN: 3            – odpověď je volba 3 (u q7: výběr obsahuje 3)
 *   qN: [1, 2]       – odpověď je jedna z voleb (u q7: výběr obsahuje aspoň jednu)
 *   qN: nevim        – odpověď je „Nevím“ (nebo chybí)
 *   qN: answered     – odpověď je jiná než „Nevím“
 *   qN: { not: [6] } – odpověď je zodpovězená a není žádnou z voleb
 *   any: [When, …]   – platí aspoň jedna z vnořených podmínek
 * Otázka vynechaná pravidlem kompatibility (`omitted`) nesplní žádnou podmínku.
 */

const OptionIndex = z.number().int().min(1);

export const ConditionSchema = z.union([
  OptionIndex,
  z.array(OptionIndex).min(1),
  z.literal("nevim"),
  z.literal("answered"),
  z.object({ not: z.union([OptionIndex, z.array(OptionIndex).min(1)]) }).strict(),
]);
export type Condition = z.infer<typeof ConditionSchema>;

export type When = { [K in QuestionId]?: Condition } & { any?: When[] };

export const WhenSchema: z.ZodType<When> = z.lazy(() =>
  z
    .object({
      q1: ConditionSchema.optional(),
      q2: ConditionSchema.optional(),
      q3: ConditionSchema.optional(),
      q4: ConditionSchema.optional(),
      q5: ConditionSchema.optional(),
      q6: ConditionSchema.optional(),
      q7: ConditionSchema.optional(),
      q8: ConditionSchema.optional(),
      any: z.array(WhenSchema).min(1).optional(),
    })
    .strict(),
);

export const LegalReviewSchema = z.enum(["pending", "approved"]);
export type LegalReview = z.infer<typeof LegalReviewSchema>;

const Text = z.string().trim().min(1);

export const PointSchema = z.union([Text, z.object({ when: WhenSchema.optional(), text: Text }).strict()]);
export type Point = z.infer<typeof PointSchema>;

export const SubsectionSchema = z
  .object({
    when: WhenSchema.optional(),
    text: Text,
    points: z.array(PointSchema).min(1).optional(),
  })
  .strict();
export type Subsection = z.infer<typeof SubsectionSchema>;

export const ParagraphSchema = z
  .object({
    id: z.string().min(1),
    title: Text.optional(),
    when: WhenSchema.optional(),
    /** Zkratka pro paragraf s jediným odstavcem. */
    text: Text.optional(),
    subsections: z.array(SubsectionSchema).min(1).optional(),
    /** Odkazy na tvrzení v content/explainers/*.yaml, ze kterých text vychází. */
    claim_refs: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine((p) => (p.text === undefined) !== (p.subsections === undefined), {
    message: "Paragraf musí mít buď `text`, nebo `subsections` (ne obojí).",
  });
export type Paragraph = z.infer<typeof ParagraphSchema>;

const QuestionIdSchema = z.enum(QUESTION_IDS);

export const SlotSchema = z.object({ id: z.string().min(1), question: QuestionIdSchema }).strict();

export const BaseItemSchema = z.union([z.object({ slot: z.string().min(1) }).strict(), ParagraphSchema]);
export type BaseItem = z.infer<typeof BaseItemSchema>;

export const LawBaseSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().min(1),
    legal_review: LegalReviewSchema,
    title: Text,
    heading: z.array(Text).min(1),
    enacting_formula: Text,
    placeholder_nevim: Text,
    ref_fallback: Text,
    labels: z
      .object({
        working_draft: Text,
        disclaimer: Text,
        header_title: Text,
        header_modules: Text,
        header_date: Text,
        header_id: Text,
        header_content_version: Text,
        uuid_placeholder: Text,
        date_placeholder: Text,
      })
      .strict(),
    slots: z.array(SlotSchema).min(1),
    parts: z
      .array(
        z
          .object({
            id: z.string().min(1),
            title: Text,
            items: z.array(BaseItemSchema).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type LawBase = z.infer<typeof LawBaseSchema>;

export const LawModuleSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().min(1),
    legal_review: LegalReviewSchema,
    slot: z.string().min(1),
    questions: z.array(QuestionIdSchema).min(1),
    paragraphs: z.array(ParagraphSchema).min(1),
  })
  .strict();
export type LawModule = z.infer<typeof LawModuleSchema>;

const AllowValue = z.union([OptionIndex, z.literal("nevim")]);

export const CompatibilityRuleSchema = z
  .object({
    id: z.string().min(1),
    origin: z.enum(["spec-5.2", "law"]),
    when: WhenSchema,
    allow: z
      .object({
        q2: z.array(AllowValue).min(1).optional(),
        q3: z.array(AllowValue).min(1).optional(),
        q4: z.array(AllowValue).min(1).optional(),
        q5: z.array(AllowValue).min(1).optional(),
        q6: z.array(AllowValue).min(1).optional(),
        q8: z.array(AllowValue).min(1).optional(),
      })
      .strict()
      .optional(),
    grey: z.array(QuestionIdSchema).optional(),
    law_omit: z.array(QuestionIdSchema).optional(),
    law_replace: z.object({ slot: z.string().min(1), paragraph: ParagraphSchema }).strict().optional(),
  })
  .strict();
export type CompatibilityRule = z.infer<typeof CompatibilityRuleSchema>;

export const CompatibilitySchema = z
  .object({
    version: z.number().int().min(1),
    rules: z.array(CompatibilityRuleSchema),
  })
  .strict();
export type Compatibility = z.infer<typeof CompatibilitySchema>;

export interface LawContent {
  base: LawBase;
  modules: LawModule[];
  compatibility: Compatibility;
}

/**
 * Ověří surová data (např. z YAML) a jejich vzájemnou konzistenci:
 * sloty modulů existují v základu, id jsou unikátní, šablony odkazují jen na známé sloty.
 */
export function parseLawContent(raw: { base: unknown; modules: unknown[]; compatibility: unknown }): LawContent {
  const base = LawBaseSchema.parse(raw.base);
  const modules = raw.modules.map((m) => LawModuleSchema.parse(m));
  const compatibility = CompatibilitySchema.parse(raw.compatibility);

  const slotIds = new Set(base.slots.map((s) => s.id));
  const errors: string[] = [];

  const usedSlots = new Set<string>();
  for (const part of base.parts) {
    for (const item of part.items) {
      if ("slot" in item) {
        if (!slotIds.has(item.slot)) errors.push(`base: neznámý slot "${item.slot}"`);
        if (usedSlots.has(item.slot)) errors.push(`base: slot "${item.slot}" je použit vícekrát`);
        usedSlots.add(item.slot);
      }
    }
  }
  for (const s of slotIds) if (!usedSlots.has(s)) errors.push(`base: slot "${s}" není umístěn v žádné hlavě`);

  const ids = new Set<string>();
  const checkId = (id: string, where: string) => {
    if (ids.has(id)) errors.push(`${where}: duplicitní id "${id}"`);
    ids.add(id);
  };
  const checkTemplates = (text: string, where: string) => {
    for (const m of text.matchAll(/\{\{\s*([a-z_]+)(?::([a-z0-9_-]+))?\s*\}\}/g)) {
      const [, name, arg] = m;
      if (name === "ref") {
        if (!arg || !slotIds.has(arg)) errors.push(`${where}: odkaz na neznámý slot "${arg ?? ""}"`);
      } else if (name !== "nevim" && name !== "amount") {
        errors.push(`${where}: neznámá šablona "{{${name}}}"`);
      }
    }
  };
  const checkParagraph = (p: Paragraph, where: string) => {
    checkId(p.id, where);
    if (p.text) checkTemplates(p.text, `${where}/${p.id}`);
    for (const s of p.subsections ?? []) {
      checkTemplates(s.text, `${where}/${p.id}`);
      for (const pt of s.points ?? []) checkTemplates(typeof pt === "string" ? pt : pt.text, `${where}/${p.id}`);
    }
  };

  for (const part of base.parts) for (const item of part.items) if (!("slot" in item)) checkParagraph(item, "base");
  const moduleIds = new Set<string>();
  for (const m of modules) {
    if (moduleIds.has(m.id)) errors.push(`modul "${m.id}" je definován vícekrát`);
    moduleIds.add(m.id);
    if (!slotIds.has(m.slot)) errors.push(`modul "${m.id}": neznámý slot "${m.slot}"`);
    for (const p of m.paragraphs) checkParagraph(p, m.id);
  }
  for (const r of compatibility.rules) {
    if (r.law_replace) {
      if (!slotIds.has(r.law_replace.slot)) errors.push(`pravidlo "${r.id}": neznámý slot "${r.law_replace.slot}"`);
      checkParagraph(r.law_replace.paragraph, `compatibility/${r.id}`);
    }
  }

  if (errors.length) throw new Error(`Neplatný obsah zákona:\n- ${errors.join("\n- ")}`);
  return { base, modules, compatibility };
}
