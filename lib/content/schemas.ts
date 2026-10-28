import { z } from "zod";

/**
 * Zod schémata všech obsahových souborů v content/ (SPEC §3). Validuje je
 * `scripts/content-build.ts` při každém buildu; neplatný obsah build zastaví.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "id: malá písmena, číslice, pomlčky");

// ---------- questions.yaml ----------

export const optionSchema = z.object({
  id,
  label: z.string().min(1),
  nevim: z.boolean().optional(),
  /** U Q7: volba, která vylučuje ostatní (Platí všichni, Nevím). */
  exclusive: z.boolean().optional(),
});

export const anchorSchema = z.object({
  id,
  label: z.string().min(1),
  fact: z.string().min(1),
  multiplier: z.number().positive().optional(),
});

export const sliderSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  default: z.number(),
});

export const questionSchema = z.object({
  id: z.string().regex(/^q[1-8]$/),
  type: z.enum(["slider", "single", "multi"]),
  text: z.string().min(1),
  short: z.string().min(1),
  topic: z.string().min(1),
  slider: sliderSchema.optional(),
  anchors: z.array(anchorSchema).optional(),
  options: z.array(optionSchema).min(1),
});

export const effectSchema = z.union([
  z.object({ skip: z.literal(true) }),
  z.object({ only: z.array(z.string()).min(1) }),
  z.object({ disable: z.array(z.string()).min(1) }),
]);

export const ruleSchema = z.object({
  id,
  when: z.object({ question: z.string(), option: z.string() }),
  effects: z.record(z.string(), effectSchema),
});

const labelled = z.object({ id: z.string().min(1), label: z.string().min(1) });

export const questionsFileSchema = z
  .object({
    version: z.number().int().positive(),
    /** Pásma Q1 v pořadí od nejnižšího. Hranice jsou kotvy (faktické hodnoty z facts.yaml). */
    q1_bands: z.array(labelled).length(5),
    questions: z.array(questionSchema).length(8),
    rules: z.array(ruleSchema),
    demographics: z.object({
      regions: z.array(labelled).length(14),
      age_groups: z.array(labelled).length(4),
      municipality_sizes: z.array(labelled).length(4),
      comment_max: z.number().int().positive(),
    }),
  })
  .superRefine((file, ctx) => {
    const optionIds = new Map<string, Set<string>>();
    for (const q of file.questions) {
      optionIds.set(q.id, new Set(q.options.map((o) => o.id)));
      if (q.options.filter((o) => o.nevim).length !== 1)
        ctx.addIssue({ code: "custom", message: `${q.id}: přesně jedna volba Nevím` });
      if (q.type === "slider" && (!q.slider || !q.anchors?.length))
        ctx.addIssue({ code: "custom", message: `${q.id}: posuvník potřebuje slider a anchors` });
    }
    for (const r of file.rules) {
      if (!optionIds.get(r.when.question)?.has(r.when.option))
        ctx.addIssue({ code: "custom", message: `pravidlo ${r.id}: neznámá volba ${r.when.option}` });
      for (const [qid, eff] of Object.entries(r.effects)) {
        const opts = optionIds.get(qid);
        if (!opts) {
          ctx.addIssue({ code: "custom", message: `pravidlo ${r.id}: neznámá otázka ${qid}` });
          continue;
        }
        const list = "only" in eff ? eff.only : "disable" in eff ? eff.disable : [];
        for (const o of list)
          if (!opts.has(o)) ctx.addIssue({ code: "custom", message: `pravidlo ${r.id}: neznámá volba ${o}` });
      }
    }
  });

// ---------- sentences.yaml ----------

const sentence = z.object({ id, version: z.number().int().positive(), text: z.string().min(1) });

export const sentencesFileSchema = z.object({
  version: z.string().min(1),
  intro: sentence,
  outro: sentence,
  nevim: sentence.extend({ text: z.string().includes("{topic}") }),
  q1: z.array(sentence.extend({ band: z.string(), text: z.string().includes("{amount}") })).length(5),
  multi: z.record(z.string(), sentence.extend({ text: z.string().includes("{items}") })),
  options: z.record(
    z.string(),
    // strict: neuvozovkovaná čárka v YAML flow mapě `{ text: A, B }` utne text a vyrobí klíč „B“.
    z.strictObject({ version: z.number().int().positive(), text: z.string().optional(), fragment: z.string().optional() }),
  ),
});

// ---------- facts.yaml ----------

export const factSchema = z.looseObject({
  id: z.string().min(1),
  value: z.number().nullable(),
  unit: z.string(),
  claim: z.string(),
  source_url: z.string(),
  source_title: z.string(),
  locator: z.string(),
  status: z.string(),
});
export const factsFileSchema = z.array(factSchema);

// ---------- explainers/*.yaml (píšou rešeršní agenti, my jen čteme) ----------

export const claimSchema = z.looseObject({
  id: z.string().min(1),
  claim: z.string().min(1),
  source_url: z.string(),
  source_title: z.string(),
  locator: z.string(),
  quote: z.string().optional().nullable(),
});

/** Soubory vysvětlivek: q{n}.yaml (otázka) a q{n}-opt{k}.yaml (volba). Ostatní soubory ve složce se ignorují. */
export const EXPLAINER_FILE_RE = /^q[1-8](-opt\d+)?\.yaml$/;

export const explainerSchema = z
  .looseObject({
    id: z.string().regex(/^q[1-8](-opt\d+)?$/),
    text: z.string().min(1),
    /** Povinné jen u vysvětlivek voleb (q{n}-opt{k}); u otázek mohou chybět. */
    pro: z.string().optional().nullable(),
    proti: z.string().optional().nullable(),
    claims: z.array(claimSchema).default([]),
    status: z.enum(["draft", "verified", "needs_human"]).optional(),
    human_reviewed: z.boolean().optional(),
  })
  .superRefine((e, ctx) => {
    if (e.id.includes("-opt") && (!e.pro || !e.proti))
      ctx.addIssue({ code: "custom", message: `${e.id}: vysvětlivka volby potřebuje pro i proti` });
  });

export const verificationRecordSchema = z.looseObject({
  claim_id: z.string(),
  verdict: z.enum(["ano", "ne", "oprava"]),
  correction: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  url_checked: z.string().optional().nullable(),
  checked_at: z.string().optional().nullable(),
  verifier: z.string().optional().nullable(),
  round: z.number().optional().nullable(),
  claim_hash: z.string().optional().nullable(),
});

export const reviewSchema = z.looseObject({
  impartiality: z.string(),
  clarity: z.string(),
});

// ---------- ui.yaml, stance.yaml, share.yaml, slogans.yaml ----------

type UiTree = { [key: string]: string | string[] | UiTree };
export const uiTreeSchema: z.ZodType<UiTree> = z.lazy(() =>
  z.record(z.string(), z.union([z.string(), z.array(z.string().min(1)).min(1), uiTreeSchema])),
);

/** Sekce ui.yaml, které čtou jen serverové loadery – do klientského ui.json se nezapisují. */
export const UI_SERVER_SECTIONS = ["sign", "verify", "page", "email", "photo", "akce", "zakon", "hnuti", "org", "method", "sources", "about", "privacy", "share", "compare_page"] as const;

export const stanceFileSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  todo: z.string().optional(),
  actions: z.array(z.object({ label: z.string().min(1), href: z.string().startsWith("/") })).length(2),
});

export const shareFileSchema = z.object({
  moments: z.array(
    z.object({ id, text: z.string().min(1), image: z.string().min(1) }),
  ),
});

export const slogansFileSchema = z.object({ slogans: z.array(z.object({ id, text: z.string().min(1) })).length(3) });

export const plainLanguageSchema = z.union([
  z.array(
    z.looseObject({
      term: z.string().optional(),
      banned: z.string().optional(),
      replacement: z.string().optional(),
      plain: z.string().optional(),
    }),
  ),
  z.looseObject({ terms: z.array(z.looseObject({})).optional() }),
  z.record(z.string(), z.unknown()),
]);

export type QuestionsFile = z.infer<typeof questionsFileSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionOption = z.infer<typeof optionSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type SentencesFile = z.infer<typeof sentencesFileSchema>;
export type Fact = z.infer<typeof factSchema>;
export type FactValue = Pick<Fact, "id" | "value">;
export type Explainer = z.infer<typeof explainerSchema>;
export type StanceFile = z.infer<typeof stanceFileSchema>;
export type ShareFile = z.infer<typeof shareFileSchema>;
export type SlogansFile = z.infer<typeof slogansFileSchema>;
export type { UiTree };
