/**
 * SPEC §10 – Můj zákon: moduly podle odpovědí, „Nevím“ = zástupný text, dopočítané číslování
 * paragrafů, štítek pracovní verze, dokud nejsou všechny moduly approved, a vždy upozornění.
 */
import { describe, expect, it } from "vitest";
import { composeLawFromCompass, lawToPlainText, type LawDocument } from "@/lib/law";
import { loadLawContent } from "@/lib/law/load";
import type { Answers } from "@/lib/compose/types";
import { optionIdByLabel, questionsYaml } from "./helpers/content";

const file = questionsYaml();
const id = (qid: string, label: string) => optionIdByLabel(qid, label, file);
const content = loadLawContent();
const NEVIM = "[Tuto otázku ponechávám na zákonodárci.]";
const WORKING = "Pracovní verze, neprověřeno právníkem";
const DISCLAIMER = "Ilustrativní text složený z modulů. Neprošel legislativním procesem.";

const compose = (a: Answers, c = content, extra: { date?: string; uuid?: string } = {}) =>
  composeLawFromCompass(a as never, "test", { content: c, ...extra });
const paragraphs = (d: LawDocument) => d.parts.flatMap((p) => p.paragraphs);
const fullText = (d: LawDocument) => lawToPlainText(d);

const FULL: Answers = {
  q1: 9.2,
  q2: id("q2", "Poplatek jako dnes"),
  q3: id("q3", "Zákon, s růstem podle inflace"),
  q4: id("q4", "Každý dospělý"),
  q5: id("q5", "Ne, všichni stejně"),
  q6: id("q6", "Ano, méně"),
  q7: [id("q7", "Studenti"), id("q7", "Lidé se zdravotním postižením")],
  q8: id("q8", "Podle zisku, s horní hranicí"),
};

describe("§10 moduly", () => {
  it("matice kompatibility je v law/compatibility.yaml a každý modul má legal_review", () => {
    expect(content.compatibility).toBeDefined();
    for (const m of [content.base, ...content.modules]) expect(["pending", "approved"]).toContain(m.legal_review);
  });

  it("Q2 má 6 různých modulových textů (jeden za každou volbu kromě Nevím)", () => {
    const labels = file.questions.find((q) => q.id === "q2")!.options.filter((o) => !o.nevim).map((o) => o.label);
    expect(labels).toHaveLength(6);
    const texts = labels.map((l) => {
      const d = compose({ q2: id("q2", l) });
      return paragraphs(d)
        .filter((p) => p.slot === "source")
        .map((p) => p.subsections.map((s) => s.text).join(" "))
        .join("|");
    });
    expect(new Set(texts).size).toBe(6);
  });

  it("Q3 má 3 různé texty a Q8 5 různých textů (při Q2 = Poplatek)", () => {
    const base = { q2: id("q2", "Poplatek jako dnes") };
    const bySlot = (a: Answers, slot: string) =>
      paragraphs(compose(a))
        .filter((p) => p.slot === slot)
        .map((p) => p.subsections.map((s) => [s.text, ...s.points.map((x) => x.text)].join(" ")).join("|"))
        .join("#");
    const q3 = ["Zákon, s růstem podle inflace", "Vláda a poslanci každý rok", "Nezávislá komise na několik let"].map((l) =>
      bySlot({ ...base, q3: id("q3", l) }, "setting"),
    );
    expect(new Set(q3).size).toBe(3);
    const q8 = ["Ne", "Podle počtu zaměstnanců", "Podle zisku, s horní hranicí", "Podle obratu, s horní hranicí", "Jen velké firmy"].map((l) =>
      bySlot({ ...base, q8: id("q8", l) }, "firms"),
    );
    expect(new Set(q8).size).toBe(5);
  });

  it("Q1 výše se propíše jako částka", () => {
    expect(fullText(compose(FULL))).toMatch(/9\s200\s000\s000\sKč/);
  });
});

describe("§10 „Nevím“", () => {
  it("odpověď Nevím vloží „[Tuto otázku ponechávám na zákonodárci.]“", () => {
    const d = compose({ ...FULL, q3: id("q3", "Nevím") });
    expect(fullText(d)).toContain(NEVIM);
    expect(paragraphs(d).some((p) => p.isPlaceholder)).toBe(true);
  });
  it("úplné odpovědi zástupný text neobsahují", () => {
    expect(fullText(compose(FULL))).not.toContain(NEVIM);
  });
});

describe("§10 číslování paragrafů se dopočítá", () => {
  const check = (d: LawDocument) => {
    const nums = paragraphs(d).map((p) => p.number);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
    for (const p of paragraphs(d)) expect(p.label.replace(/\s/g, " ")).toBe(`§ ${p.number}`);
    // odkazy „§ N“ v textu míří jen na existující paragrafy
    const refs = [...fullText(d).matchAll(/§\s(\d+)/g)].map((m) => Number(m[1]));
    for (const r of refs) expect(r).toBeLessThanOrEqual(nums.length);
  };
  it("úplné odpovědi: §1..§N bez mezer", () => check(compose(FULL)));
  it("Státní rozpočet s pojistkami (odpadlé moduly): §1..§N bez mezer a méně paragrafů", () => {
    const full = compose(FULL);
    const budget = compose({ q1: 8, q2: id("q2", "Státní rozpočet s pojistkami"), q3: id("q3", "Nezávislá komise na několik let") });
    check(budget);
    expect(paragraphs(budget).length).toBeLessThan(paragraphs(full).length);
  });
  it("vše Nevím: §1..§N bez mezer", () => check(compose({})));
});

describe("§10 štítky", () => {
  it("dokud není vše approved: štítek „Pracovní verze, neprověřeno právníkem“ + upozornění", () => {
    const d = compose(FULL);
    if ([content.base, ...content.modules].some((m) => m.legal_review !== "approved")) {
      expect(d.allApproved).toBe(false);
      expect(d.workingDraftLabel).toBe(WORKING);
    }
    expect(d.disclaimer).toBe(DISCLAIMER);
    expect(fullText(d)).toContain(DISCLAIMER);
  });

  it("jediný pending modul stačí na štítek pracovní verze", () => {
    const c = structuredClone(content);
    c.base.legal_review = "approved";
    for (const m of c.modules) m.legal_review = "approved";
    c.modules[0]!.legal_review = "pending";
    const usesFirst = compose(FULL, c).header.modules.some((m) => m.id === c.modules[0]!.id);
    if (usesFirst) expect(compose(FULL, c).workingDraftLabel).toBe(WORKING);
  });

  it("po schválení všech modulů štítek zmizí, upozornění zůstane", () => {
    const c = structuredClone(content);
    c.base.legal_review = "approved";
    for (const m of c.modules) m.legal_review = "approved";
    const d = compose(FULL, c);
    expect(d.allApproved).toBe(true);
    expect(d.workingDraftLabel).toBeNull();
    expect(fullText(d)).not.toContain(WORKING);
    expect(d.disclaimer).toBe(DISCLAIMER);
    expect(fullText(d)).toContain(DISCLAIMER);
  });
});

describe("§10 hlavička: verze modulů, datum, UUID", () => {
  it("obsahuje verze modulů, datum a UUID", () => {
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    const d = compose(FULL, content, { date: "28. 10. 2026", uuid });
    expect(d.header.date).toBe("28. 10. 2026");
    expect(d.header.uuid).toBe(uuid);
    expect(d.header.modules.length).toBeGreaterThan(1);
    for (const m of d.header.modules) expect(m.version).toBeGreaterThanOrEqual(1);
    const txt = fullText(d);
    expect(txt).toContain(uuid);
    expect(txt).toContain("28. 10. 2026");
  });
  it("je deterministický", () => {
    expect(fullText(compose(FULL, content, { date: "1. 1. 2027", uuid: "x" }))).toBe(fullText(compose(FULL, content, { date: "1. 1. 2027", uuid: "x" })));
  });
});
