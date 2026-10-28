import { describe, expect, it } from "vitest";
import { applyCompatibility, composeLaw, composeLawFromCompass, formatAmountCzk, lawToPlainText, type LawDocument } from "./compose";
import { fromCompassAnswers, normalizeAnswers, OPTION_COUNT, type Answers } from "./answers";
import { loadLawContent } from "./load";
import { parseLawContent } from "./schema";

const content = loadLawContent();
const compose = (answers: Answers, extra: { date?: string; uuid?: string } = {}) =>
  composeLaw(answers, "test-1", { content, ...extra });

const allParagraphs = (doc: LawDocument) => doc.parts.flatMap((p) => p.paragraphs);
const ids = (doc: LawDocument) => allParagraphs(doc).map((p) => p.id);
const text = (doc: LawDocument) => lawToPlainText(doc);
const NBSP = " ";

const FULL: Answers = { q1: { value: 9.2 }, q2: 1, q3: 1, q4: 2, q5: 1, q6: 2, q7: [2, 3], q8: 3 };

describe("obsah zákona", () => {
  it("projde zod schématem a kontrolou konzistence", () => {
    expect(content.base.id).toBe("base");
    expect(content.modules.map((m) => m.slot).sort()).toEqual(
      ["amount", "exemptions", "firms", "payer", "setting", "source"].sort(),
    );
  });

  it("všechny moduly mají verzi a legal_review", () => {
    for (const m of [content.base, ...content.modules]) {
      expect(m.version).toBeGreaterThanOrEqual(1);
      expect(["pending", "approved"]).toContain(m.legal_review);
    }
  });

  it("odmítne modul s odkazem na neznámý slot", () => {
    const bad = structuredClone(content.modules[0]!);
    bad.paragraphs = [{ id: "x", text: "viz {{ref:neexistuje}}" }];
    expect(() =>
      parseLawContent({ base: content.base, compatibility: content.compatibility, modules: [bad] }),
    ).toThrow(/neznámý slot/);
  });

  it("Q2 má 6 variant + Nevím, Q3 3 + Nevím, Q8 5 + Nevím", () => {
    const variants = (moduleId: string) =>
      content.modules.find((m) => m.id === moduleId)!.paragraphs.filter((p) => p.id !== `${moduleId.slice(0, 2)}-nevim`);
    expect(variants("q2-zdroj")).toHaveLength(6);
    expect(variants("q3-stanoveni")).toHaveLength(3);
    // Q8: „Ne“ + společný paragraf pro 2–5 s odstavci pro každou variantu
    const q8 = content.modules.find((m) => m.id === "q8-firmy")!;
    for (let k = 1; k <= 5; k++) {
      const doc = compose({ q2: 1, q8: k });
      expect(allParagraphs(doc).some((p) => p.source === "q8-firmy" && !p.isPlaceholder)).toBe(true);
    }
    expect(q8.paragraphs.some((p) => p.id === "q8-nevim")).toBe(true);
  });
});

describe("výběr modulů", () => {
  it("úplné odpovědi vyberou správné varianty", () => {
    const doc = compose(FULL);
    expect(ids(doc)).toEqual([
      "base-predmet",
      "base-ucel",
      "q1-castka",
      "q2-1-poplatek",
      "q3-1-inflace",
      "q4-2-dospely",
      "q5-vyse-poplatku",
      "q67-osvobozeni",
      "q8-odvod",
      "base-hospodareni",
      "base-prechodne",
      "base-zrusovaci",
      "base-ucinnost",
    ]);
    expect(text(doc)).toContain(`9${NBSP}200${NBSP}000${NBSP}000${NBSP}Kč`);
    expect(text(doc)).toContain("ze základu daně z příjmů");
  });

  it("každá volba Q2 vybere vlastní paragraf zdroje", () => {
    const expected: Record<number, string> = {
      1: "q2-1-poplatek",
      2: "q2-2-poplatek-dane",
      3: "q2-3-rozpocet-pojistky",
      4: "q2-4-navrh-vlady",
      5: "q2-5-rozpocet",
      6: "q2-6-dobrovolne",
      7: "q2-nevim",
    };
    for (const [k, id] of Object.entries(expected)) {
      const doc = compose({ ...FULL, q2: Number(k) });
      const source = allParagraphs(doc).filter((p) => p.slot === "source");
      expect(source.map((p) => p.id)).toEqual([id]);
    }
  });

  it("každá volba Q3 vybere vlastní paragraf", () => {
    const expected = ["q3-1-inflace", "q3-2-kazdorocne", "q3-3-komise", "q3-nevim"];
    expected.forEach((id, i) => {
      const doc = compose({ ...FULL, q3: i + 1 });
      expect(allParagraphs(doc).filter((p) => p.slot === "setting").map((p) => p.id)).toEqual([id]);
    });
  });

  it("Nevím vloží text pro zákonodárce u každé otázky", () => {
    const doc = compose({});
    const placeholders = allParagraphs(doc).filter((p) => p.isPlaceholder);
    expect(placeholders.map((p) => p.id)).toEqual([
      "q1-nevim",
      "q2-nevim",
      "q3-nevim",
      "q4-nevim",
      "q5-nevim",
      "q6-nevim",
      "q7-nevim",
      "q8-nevim",
    ]);
    for (const p of placeholders) {
      expect(p.subsections).toHaveLength(1);
      expect(p.subsections[0]!.text).toBe("[Tuto otázku ponechávám na zákonodárci.]");
    }
    // bez známého zdroje se dosavadní zákon o poplatcích neruší
    expect(ids(doc)).not.toContain("base-zrusovaci");
  });

  it("index poslední volby (Nevím) je totéž co 'nevim'", () => {
    const a = compose({ ...FULL, q5: OPTION_COUNT.q5, q8: OPTION_COUNT.q8 });
    const b = compose({ ...FULL, q5: "nevim", q8: "nevim" });
    expect(text(a)).toBe(text(b));
  });

  it("Q7: osvobození se skládají do písmen a), b)… s interpunkcí", () => {
    const doc = compose({ ...FULL, q6: 3, q7: [1, 2, 3, 4] });
    const p = allParagraphs(doc).find((x) => x.id === "q67-osvobozeni")!;
    const points = p.subsections[0]!.points;
    expect(points.map((x) => x.label)).toEqual(["a)", "b)", "c)", "d)", "e)"]);
    expect(points[0]!.text).toBe("poživatelem starobního důchodu,");
    expect(points.at(-1)!.text.endsWith(".")).toBe(true);
    expect(points.slice(0, -1).every((x) => x.text.endsWith(","))).toBe(true);
  });

  it("Q7: „Platí všichni“ vylučuje ostatní volby", () => {
    const doc = compose({ ...FULL, q6: 1, q7: [1, 5] });
    expect(doc.effectiveAnswers.q7).toEqual([5]);
    expect(doc.adjustments.some((a) => a.reason === "normalize:q7-exclusive")).toBe(true);
    expect(text(doc)).toContain("Od poplatku není nikdo osvobozen.");
  });

  it("Q8: každá varianta má vlastní znění", () => {
    const texts = [1, 2, 3, 4, 5].map((k) =>
      allParagraphs(compose({ ...FULL, q8: k }))
        .filter((p) => p.slot === "firms")
        .map((p) => p.subsections.map((s) => s.text).join(" "))
        .join(" "),
    );
    expect(new Set(texts).size).toBe(5);
  });

  it("hlavička nese verze modulů, datum a uuid; bez nich zástupné texty", () => {
    const doc = compose(FULL, { date: "28. 10. 2026", uuid: "1234" });
    expect(doc.header.date).toBe("28. 10. 2026");
    expect(doc.header.uuid).toBe("1234");
    expect(doc.header.contentVersion).toBe("test-1");
    expect(doc.header.modules.map((m) => m.id)).toEqual([
      "base",
      "q1-vyse",
      "q2-zdroj",
      "q3-stanoveni",
      "q4-q5-poplatnik",
      "q6-q7-osvobozeni",
      "q8-firmy",
    ]);
    const plain = compose(FULL);
    expect(plain.header.uuid).toBe("{uuid}");
    expect(plain.header.date).toBe("{datum}");
  });

  it("dokud nejsou moduly approved, nese štítek pracovní verze; upozornění vždy", () => {
    const doc = compose(FULL);
    expect(doc.allApproved).toBe(false);
    expect(doc.workingDraftLabel).toBe("Pracovní verze, neprověřeno právníkem");
    expect(doc.disclaimer).toBe("Ilustrativní text složený z modulů. Neprošel legislativním procesem.");

    const approved = structuredClone(content);
    approved.base.legal_review = "approved";
    for (const m of approved.modules) m.legal_review = "approved";
    const ok = composeLaw(FULL, "x", { content: approved });
    expect(ok.allApproved).toBe(true);
    expect(ok.workingDraftLabel).toBeNull();
    expect(ok.disclaimer).toBe(doc.disclaimer);
  });

  it("allApproved počítá jen použité moduly", () => {
    const c = structuredClone(content);
    c.base.legal_review = "approved";
    for (const m of c.modules) m.legal_review = m.id === "q4-q5-poplatnik" ? "pending" : "approved";
    // Q2 = 3 → modul poplatníka se nepoužije
    expect(composeLaw({ ...FULL, q2: 3, q3: 1 }, "x", { content: c }).allApproved).toBe(true);
    expect(composeLaw(FULL, "x", { content: c }).allApproved).toBe(false);
  });

  it("je deterministické", () => {
    expect(JSON.stringify(compose(FULL))).toBe(JSON.stringify(compose(FULL)));
  });
});

describe("kompatibilita (SPEC §5.2)", () => {
  const compass = (answers: Answers) =>
    applyCompatibility(normalizeAnswers(answers).effective, content.compatibility, "compass").effective;

  it("Q2 = 1, 2, 7: nic se nemění", () => {
    for (const q2 of [1, 2, 7]) {
      const eff = compass({ ...FULL, q2 });
      expect({ ...eff, q2: 0 }).toEqual({ ...normalizeAnswers(FULL).effective, q2: 0 });
    }
  });

  it("Q2 = 3: zakáže „Vláda a poslanci“, Q4 jen „Nikdo zvlášť“, Q5–Q7 zašednou, Q8 jen „Ne“", () => {
    expect(compass({ ...FULL, q2: 3, q3: 2 }).q3).toBe("nevim");
    expect(compass({ ...FULL, q2: 3, q3: 3 }).q3).toBe(3);
    const eff = compass({ ...FULL, q2: 3 });
    expect(eff.q4).toBe(3);
    expect(eff.q5).toBe("omitted");
    expect(eff.q6).toBe("omitted");
    expect(eff.q7).toBe("omitted");
    expect(eff.q8).toBe(1);
  });

  it("Q2 = 4: předvyplní „Zákon…“", () => {
    expect(compass({ ...FULL, q2: 4, q3: 3 }).q3).toBe(1);
    expect(compass({ ...FULL, q2: 4, q3: "nevim" }).q3).toBe(1);
  });

  it("Q2 = 5: předvyplní „Vláda a poslanci…“", () => {
    expect(compass({ ...FULL, q2: 5, q3: 1 }).q3).toBe(2);
  });

  it("Q2 = 6: Q3–Q8 celé zašednou", () => {
    const eff = compass({ ...FULL, q2: 6 });
    for (const q of ["q3", "q4", "q5", "q6", "q7", "q8"] as const) expect(eff[q]).toBe("omitted");
    expect(eff.q1).toBe(9.2);
  });

  it("zákon: rozpočtové zdroje vynechají hlavy o poplatku a podnikatelích", () => {
    for (const q2 of [3, 4, 5]) {
      const doc = compose({ ...FULL, q2, q3: q2 === 3 ? 3 : undefined });
      expect(doc.parts.map((p) => p.id)).toEqual(["uvodni-ustanoveni", "vyse-a-zdroj", "zaverecna-ustanoveni"]);
      expect(allParagraphs(doc).some((p) => p.isPlaceholder)).toBe(false);
    }
  });

  it("zákon: Q2 = 4 → Q3 = zákon s inflací; Q2 = 5 → každoroční zákon o státním rozpočtu", () => {
    expect(ids(compose({ ...FULL, q2: 4, q3: 3 }))).toContain("q3-1-inflace");
    const d5 = compose({ ...FULL, q2: 5, q3: 1 });
    expect(ids(d5)).toContain("q3-2-kazdorocne");
    expect(text(d5)).toContain("stanoví zákon o státním rozpočtu na příslušný rok");
  });

  it("zákon: Q2 = 6 vynechá vše kromě výše a zdroje; výše je cílová", () => {
    const doc = compose({ ...FULL, q2: 6 });
    expect(allParagraphs(doc).filter((p) => p.slot).map((p) => p.id)).toEqual(["q1-cil", "q2-6-dobrovolne"]);
  });

  it("zákon: poplatek bez poplatníka (Q2 = 1, Q4 = 3) → poznámka o rozporu, bez osvobození", () => {
    const doc = compose({ ...FULL, q4: 3 });
    expect(doc.appliedRules).toContain("poplatek-bez-poplatnika");
    const payer = allParagraphs(doc).filter((p) => p.slot === "payer");
    expect(payer.map((p) => p.id)).toEqual(["rozpor-poplatek-bez-poplatnika"]);
    expect(payer[0]!.isPlaceholder).toBe(true);
    expect(allParagraphs(doc).some((p) => p.slot === "exemptions")).toBe(false);
  });

  it("zákon: Q4 = 3 při neznámém zdroji → státní rozpočet, bez Q5–Q7", () => {
    const doc = compose({ ...FULL, q2: "nevim", q4: 3 });
    expect(allParagraphs(doc).filter((p) => p.slot === "payer").map((p) => p.id)).toEqual(["q4-3-nikdo"]);
    expect(allParagraphs(doc).some((p) => p.slot === "exemptions")).toBe(false);
  });
});

describe("číslování", () => {
  const SAMPLES: Answers[] = [
    FULL,
    {},
    { ...FULL, q2: 6 },
    { ...FULL, q2: 3, q3: 3 },
    { ...FULL, q4: 1, q5: 2, q6: 3, q7: [1, 4] },
    { q1: "nevim", q2: 2, q3: 2, q4: 1, q5: 4, q6: 2, q7: "nevim", q8: 5 },
  ];

  it("paragrafy jsou číslované souvisle od 1 a hlavy římsky od I", () => {
    for (const a of SAMPLES) {
      const doc = compose(a);
      const nums = allParagraphs(doc).map((p) => p.number);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
      expect(allParagraphs(doc).every((p) => p.label === `§${NBSP}${p.number}`)).toBe(true);
      doc.parts.forEach((p, i) => expect(p.number).toBe(i + 1));
      expect(doc.parts.map((p) => p.label).slice(0, 3)).toEqual(["HLAVA I", "HLAVA II", "HLAVA III"].slice(0, doc.parts.length));
    }
  });

  it("odstavce se číslují jen u víceodstavcových paragrafů", () => {
    for (const a of SAMPLES) {
      for (const p of allParagraphs(compose(a))) {
        if (p.subsections.length === 1) expect(p.subsections[0]!.label).toBeNull();
        else expect(p.subsections.map((s) => s.label)).toEqual(p.subsections.map((_, i) => `(${i + 1})`));
      }
    }
  });

  it("odkazy {{ref:…}} ukazují na dopočítané číslo paragrafu", () => {
    const full = compose(FULL);
    const amount = allParagraphs(full).find((p) => p.slot === "amount")!;
    const source = allParagraphs(full).find((p) => p.id === "q5-vyse-poplatku")!;
    expect(source.subsections.map((s) => s.text).join(" ")).toContain(`podle §${NBSP}${amount.number}`);

    // q2 = 6 → méně paragrafů, jiné číslo zrušovacího ustanovení
    const vol = compose({ ...FULL, q2: 6 });
    const nZrus = (d: LawDocument) => allParagraphs(d).find((p) => p.id === "base-zrusovaci")!.number;
    expect(nZrus(vol)).toBeLessThan(nZrus(full));
  });

  it("chybějící slot v odkazu → „tohoto zákona“", () => {
    const c = structuredClone(content);
    c.modules = c.modules.filter((m) => m.slot !== "amount");
    const doc = composeLaw(FULL, "x", { content: c });
    expect(text(doc)).toContain("podle tohoto zákona");
  });

  it("žádná šablona {{…}} nezůstane v textu pro žádnou kombinaci hlavních voleb", () => {
    for (let q2 = 1; q2 <= 7; q2++)
      for (let q3 = 1; q3 <= 4; q3++)
        for (let q4 = 1; q4 <= 4; q4++)
          for (let q5 = 1; q5 <= 5; q5++)
            for (const q7 of [[1], [5], [2, 3, 4], "nevim"] as const)
              for (const q8 of [1, 3, 6]) {
                const a: Answers = { q1: { value: 7.8 }, q2, q3, q4, q5, q6: ((q5 % 4) + 1), q7: q7 === "nevim" ? q7 : [...q7], q8 };
                const t = text(compose(a));
                expect(t).not.toMatch(/\{\{|\}\}/);
                for (const p of allParagraphs(compose(a))) expect(p.subsections.length).toBeGreaterThan(0);
              }
  });
});

describe("formatAmountCzk", () => {
  it("formátuje miliardy na koruny s mezerami", () => {
    expect(formatAmountCzk(9.2)).toBe(`9${NBSP}200${NBSP}000${NBSP}000${NBSP}Kč`);
    expect(formatAmountCzk(7.8)).toBe(`7${NBSP}800${NBSP}000${NBSP}000${NBSP}Kč`);
    expect(formatAmountCzk(12)).toBe(`12${NBSP}000${NBSP}000${NBSP}000${NBSP}Kč`);
  });
});

describe("mapování z odpovědí kompasu (lib/compose)", () => {
  it("převede id voleb na indexy", () => {
    expect(
      fromCompassAnswers({ q1: 9.2, q2: "q2-opt1", q3: "q3-nevim", q7: ["q7-opt2", "q7-opt3"], q8: "q8-opt5" }),
    ).toEqual({ q1: { value: 9.2 }, q2: 1, q3: "nevim", q7: [2, 3], q8: 5 });
    expect(fromCompassAnswers({ q1: "q1-nevim", q7: ["q7-nevim"] })).toEqual({ q1: "nevim", q7: "nevim" });
  });

  it("composeLawFromCompass dá stejný zákon jako indexové odpovědi", () => {
    const viaCompass = composeLawFromCompass(
      { q1: 9.2, q2: "q2-opt1", q3: "q3-opt1", q4: "q4-opt2", q5: "q5-opt1", q6: "q6-opt2", q7: ["q7-opt2", "q7-opt3"], q8: "q8-opt3" },
      "test-1",
      { content },
    );
    expect(lawToPlainText(viaCompass)).toBe(lawToPlainText(compose(FULL)));
  });
});
