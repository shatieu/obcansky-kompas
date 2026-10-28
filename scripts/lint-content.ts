/**
 * `pnpm lint:content` – limity textu ze SPEC §4.1 a srozumitelnost (§11.2/5).
 * Při porušení skončí s chybou; je součástí `pnpm build`, takže build selže.
 */
import { ContentError, loadContent, loadPlainLanguage } from "../lib/content/load";
import type { UiTree } from "../lib/content/schemas";
import { countWords, findBannedTerms, splitSentences } from "../lib/content/text";
import { signTextsSchema } from "../lib/sign/texts";
import { PhotoUiSchema } from "../lib/photo/content";
import { pagesTextsSchema } from "../lib/org/texts";
import { loadDemoSlogans, REQUIRED_PRESET_IDS } from "../lib/demo/slogans-schema";
import { demoTextsSchema } from "../components/demonstrace/join/texts";
import { crowdTextsSchema } from "../lib/crowd/texts";
import { lookupTextsSchema } from "../lib/sign/lookup-texts";
import { loadLinks } from "../lib/content/links-schema";
import { META_DESCRIPTION_MAX, seoTextsSchema } from "../lib/seo/texts";

const LIMITS = {
  question: { words: 8 },
  option: { words: 6, chars: 40 },
  heading: { words: 8 },
  lead: { sentences: 1, chars: 120 },
  explainer: { sentences: 4, wordsPerSentence: 20 },
  button: { words: 3 },
  quote: { words: 15 },
};

/** Texty doslova předepsané SPEC (§13: otázka na hlavní stránce). */
const SPEC_MANDATED = new Set(["ui.home.title"]);

const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);

function checkHeading(where: string, text: string) {
  const w = countWords(text);
  if (w > LIMITS.heading.words) err(where, `nadpis má ${w} slov (max. ${LIMITS.heading.words})`);
}
function checkLead(where: string, text: string) {
  const s = splitSentences(text).length;
  if (s > LIMITS.lead.sentences) err(where, `text pod nadpisem má ${s} věty (max. 1)`);
  if (text.length > LIMITS.lead.chars) err(where, `text pod nadpisem má ${text.length} znaků (max. ${LIMITS.lead.chars})`);
}
function checkButton(where: string, text: string) {
  const w = countWords(text);
  if (w > LIMITS.button.words) err(where, `tlačítko má ${w} slov (max. ${LIMITS.button.words})`);
}

try {
  const c = loadContent();
  const banned = loadPlainLanguage();
  // severity: "error" = vlastní texty webu; "warn" = vysvětlivky (srozumitelnost u nich hlídá
  // review agenta srozumitelnosti, SPEC §11.2/5) a texty doslova předepsané SPEC (§5.1, §13).
  const displayed: { where: string; text: string; severity?: "error" | "warn" }[] = [];

  for (const q of c.questions.questions) {
    const w = countWords(q.text);
    if (w > LIMITS.question.words) err(`questions.${q.id}`, `otázka má ${w} slov (max. ${LIMITS.question.words})`);
    displayed.push({ where: `questions.${q.id}`, text: q.text, severity: "warn" });
    for (const o of q.options) {
      const ow = countWords(o.label);
      if (ow > LIMITS.option.words) err(`questions.${o.id}`, `volba má ${ow} slov (max. ${LIMITS.option.words})`);
      if (o.label.length > LIMITS.option.chars)
        err(`questions.${o.id}`, `volba má ${o.label.length} znaků (max. ${LIMITS.option.chars})`);
      displayed.push({ where: `questions.${o.id}`, text: o.label, severity: "warn" });
    }
    for (const a of q.anchors ?? []) displayed.push({ where: `questions.${q.id}.${a.id}`, text: a.label });
  }

  const walk = (tree: UiTree, prefix: string) => {
    for (const [k, v] of Object.entries(tree)) {
      const where = `ui.${prefix}${k}`;
      if (Array.isArray(v)) {
        v.forEach((line, i) => displayed.push({ where: `${where}[${i}]`, text: line }));
        continue;
      }
      if (typeof v !== "string") {
        walk(v, `${prefix}${k}.`);
        continue;
      }
      displayed.push({ where, text: v, severity: SPEC_MANDATED.has(where) ? "warn" : "error" });
      if (k === "title" || k.endsWith("_title")) checkHeading(where, v);
      else if (k === "lead" || k.endsWith("_lead")) checkLead(where, v);
      else if (k.endsWith("_button")) checkButton(where, v);
      // Popisy pro vyhledávače (meta description): víc než 160 znaků Google ořízne.
      if ((k === "meta_description" || prefix === "seo.descriptions.") && v.length > META_DESCRIPTION_MAX)
        err(where, `popis pro vyhledávače má ${v.length} znaků (max. ${META_DESCRIPTION_MAX})`);
    }
  };
  walk(c.ui, "");

  // Serverové sekce ui.yaml (podpis, /fotka, /akce, zákon) musí odpovídat schématům loaderů.
  const sign = signTextsSchema.safeParse({ sign: c.ui.sign, verify: c.ui.verify, page: c.ui.page, email: c.ui.email });
  if (!sign.success) err("ui.sign/verify/page/email", sign.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const photo = PhotoUiSchema.safeParse(c.ui.photo);
  if (!photo.success) err("ui.photo", photo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const pages = pagesTextsSchema.safeParse({ hnuti: c.ui.hnuti, org: c.ui.org, method: c.ui.method, sources: c.ui.sources, about: c.ui.about, privacy: c.ui.privacy });
  if (!pages.success) err("ui.hnuti/org/method/sources/about/privacy", pages.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  for (const k of ["akce", "zakon"]) if (!c.ui[k] || typeof c.ui[k] !== "object") err(`ui.${k}`, "sekce chybí");
  const demo = demoTextsSchema.safeParse(c.ui.demonstrace);
  if (!demo.success) err("ui.demonstrace", demo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const crowd = crowdTextsSchema.safeParse(c.ui.demonstrace_crowd);
  if (!crowd.success) err("ui.demonstrace_crowd", crowd.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const seo = seoTextsSchema.safeParse(c.ui.seo);
  if (!seo.success) err("ui.seo", seo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const lookup = lookupTextsSchema.safeParse(c.ui.lookup);
  if (!lookup.success) err("ui.lookup", lookup.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

  // Online demonstrace: předvolby sloganů (max. 40 znaků hlídá schéma) jdou do kontroly výrazů.
  try {
    const ds = loadDemoSlogans();
    // Tři slogany převzaté z content/slogans.yaml (doslova ze SPEC §9.3) jen varují.
    const mandated = new Set<string>(REQUIRED_PRESET_IDS);
    for (const p of ds.presets)
      displayed.push({ where: `demonstrace/slogans.${p.id}`, text: p.text, severity: mandated.has(p.id) ? "warn" : "error" });
  } catch (e) {
    err("content/demonstrace/slogans.yaml", (e as Error).message);
  }

  // Odkazy a čtení (content/links.yaml): nadpisy a názvy položek = nadpis, popisy = text pod nadpisem.
  try {
    const l = loadLinks();
    checkHeading("links.title", l.title);
    checkLead("links.lead", l.lead);
    displayed.push({ where: "links.title", text: l.title }, { where: "links.lead", text: l.lead });
    checkButton("links.method_link", l.method_link);
    checkButton("links.stance_link", l.stance_link);
    for (const [g, group] of [["reading", l.reading], ["initiatives", l.initiatives]] as const) {
      checkHeading(`links.${g}.title`, group.title);
      checkLead(`links.${g}.lead`, group.lead);
      displayed.push({ where: `links.${g}.lead`, text: group.lead });
      for (const it of group.items) {
        checkHeading(`links.${g}.${it.id}.title`, it.title);
        checkLead(`links.${g}.${it.id}.description`, it.description);
        displayed.push({ where: `links.${g}.${it.id}`, text: `${it.title} ${it.description}` });
      }
    }
  } catch (e) {
    err("content/links.yaml", (e as Error).message);
  }

  checkHeading("stance.title", c.stance.title);
  checkLead("stance.text", c.stance.text);
  for (const a of c.stance.actions) checkButton(`stance.actions.${a.href}`, a.label);
  displayed.push({ where: "stance.text", text: c.stance.text });

  for (const [k, s] of Object.entries(c.sentences.options)) displayed.push({ where: `sentences.${k}`, text: s.text ?? s.fragment ?? "" });
  for (const s of [c.sentences.intro, c.sentences.outro, c.sentences.nevim, ...c.sentences.q1])
    displayed.push({ where: `sentences.${s.id}`, text: s.text });

  for (const { explainer: e } of c.explainers) {
    const where = `explainers/${e.id}.yaml`;
    const sentences = splitSentences(e.text);
    if (sentences.length > LIMITS.explainer.sentences)
      err(where, `vysvětlivka má ${sentences.length} vět (max. ${LIMITS.explainer.sentences})`);
    sentences.forEach((s, i) => {
      const w = countWords(s);
      if (w > LIMITS.explainer.wordsPerSentence) err(where, `věta ${i + 1} má ${w} slov (max. ${LIMITS.explainer.wordsPerSentence})`);
    });
    for (const [field, text] of [["pro", e.pro], ["proti", e.proti]] as const) {
      if (!text) continue;
      const ss = splitSentences(text);
      if (ss.length > 1) err(where, `${field} má ${ss.length} věty (max. 1)`);
      const w = countWords(text);
      if (w > LIMITS.explainer.wordsPerSentence) err(where, `${field} má ${w} slov (max. ${LIMITS.explainer.wordsPerSentence})`);
    }
    if (e.pro && e.proti) {
      const a = e.pro.length;
      const b = e.proti.length;
      if (Math.abs(a - b) / Math.max(a, b) > 0.2) warnings.push(`${where}: pro a proti se liší délkou o víc než 20 %`);
    }
    for (const cl of e.claims) {
      if (cl.quote && countWords(cl.quote) > LIMITS.quote.words) err(where, `citace v ${cl.id} má víc než ${LIMITS.quote.words} slov`);
    }
    displayed.push({ where, text: [e.text, e.pro ?? "", e.proti ?? ""].join(" "), severity: "warn" });
  }

  if (banned.length) {
    for (const d of displayed)
      for (const b of findBannedTerms(d.text, banned))
      {
        const msg = `odborný výraz „${b.term}“${b.replacement ? ` → použij „${b.replacement}“` : ""}`;
        if (d.severity === "warn") warnings.push(`${d.where}: ${msg}`);
        else err(d.where, msg);
      }
  } else warnings.push("content/plain-language.yaml zatím neexistuje – kontrola odborných výrazů přeskočena");

  for (const w of warnings) console.warn(`varování: ${w}`);
  if (errors.length) {
    console.error(`lint:content – ${errors.length} porušení:\n${errors.map((e) => `  ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`lint:content: OK (${displayed.length} textů, ${banned.length} zakázaných výrazů)`);
} catch (e) {
  if (e instanceof ContentError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
