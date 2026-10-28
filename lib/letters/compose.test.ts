import { describe, expect, it } from "vitest";
import { composeLetter, countCombinations, eligibleVariants, mulberry32, type ComposeLetterInput } from "./compose";
import { loadLettersContent } from "./load";
import { ADDRESSEE_TYPES, AMBIGUOUS_GENDER_RE, LEVELS, PERSON_TYPES, POSITIONS, parseLettersContent, textForms, type Gender } from "./schema";

const content = loadLettersContent();
const SENTENCES = ["Věta jedna o financování.", "Věta dvě o výši."];
const base = (over: Partial<ComposeLetterInput> = {}): ComposeLetterInput => ({
  addressee: "poslanec",
  statementSentences: SENTENCES,
  forma: 2,
  delka: 2,
  seed: 42,
  ...over,
});

describe("obsah dopisů", () => {
  it("má všech 6 typů adresáta a každá pozice 3–5 variant", () => {
    expect(Object.keys(content.types).sort()).toEqual([...ADDRESSEE_TYPES].sort());
    for (const type of ADDRESSEE_TYPES)
      for (const pos of POSITIONS) {
        const n = content.types[type].positions[pos].length;
        expect(n).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(5);
      }
  });

  it("žádná pozice není prázdná pro žádné nastavení forma × délka", () => {
    for (const type of ADDRESSEE_TYPES)
      for (const f of LEVELS)
        for (const d of LEVELS) {
          for (const pos of POSITIONS)
            expect(eligibleVariants(content.types[type].positions[pos], f, d).length, `${type}/${pos}/${f}/${d}`).toBeGreaterThan(0);
          expect(eligibleVariants(content.common.process_block.variants, f, d).length).toBeGreaterThan(0);
        }
  });

  it("schéma odmítne typ s nepokrytým nastavením", () => {
    const raw = structuredClone(content.types.poslanec);
    raw.positions.zaver = raw.positions.zaver.map((v) => ({ ...v, forma: [1] as (1 | 2 | 3)[] }));
    const types = ADDRESSEE_TYPES.map((t) => (t === "poslanec" ? raw : content.types[t]));
    expect(() => parseLettersContent({ common: content.common, types })).toThrow(/chybí varianta/);
  });

  it("varianty jsou rodově neutrální vůči pisateli (bez „jsem …l/a“)", () => {
    const texts = ADDRESSEE_TYPES.flatMap((t) => POSITIONS.flatMap((p) => content.types[t].positions[p].flatMap((v) => textForms(v.text))));
    for (const t of texts) expect(t).not.toMatch(/\bjsem\s+\S+l(a)?\b/);
  });
});

describe("countCombinations", () => {
  it.each(ADDRESSEE_TYPES)("%s má aspoň 100 různých kombinací", (type) => {
    expect(countCombinations(type, content)).toBeGreaterThanOrEqual(100);
  });

  it("součet přes nastavení = celkový počet", () => {
    for (const type of ADDRESSEE_TYPES) {
      let sum = 0;
      for (const forma of LEVELS) for (const delka of LEVELS) sum += countCombinations(type, content, { forma, delka });
      expect(sum).toBe(countCombinations(type, content));
    }
  });

  it("odpovídá skutečně vygenerovaným kombinacím (poslanec, forma 2, délka 2)", () => {
    const expected = countCombinations("poslanec", content, { forma: 2, delka: 2 });
    const seen = new Set<string>();
    for (let s = 0; s < 3000; s++) seen.add(composeLetter(base({ seed: s }), content).combinationKey);
    expect(seen.size).toBe(expected);
  });
});

describe("composeLetter", () => {
  it("je deterministický pro stejný seed", () => {
    for (const type of ADDRESSEE_TYPES) {
      const a = composeLetter(base({ addressee: type, seed: "abc" }), content);
      const b = composeLetter(base({ addressee: type, seed: "abc" }), content);
      expect(a).toEqual(b);
    }
  });

  it("různé seedy dávají různé varianty", () => {
    const keys = new Set(Array.from({ length: 50 }, (_, s) => composeLetter(base({ seed: s }), content).combinationKey));
    expect(keys.size).toBeGreaterThan(5);
  });

  it("PRNG je deterministický", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it("vybírá jen varianty odpovídající formě a délce", () => {
    for (const type of ADDRESSEE_TYPES)
      for (const forma of LEVELS)
        for (const delka of LEVELS)
          for (let seed = 0; seed < 20; seed++) {
            const letter = composeLetter(base({ addressee: type, forma, delka, seed }), content);
            for (const part of letter.parts) {
              if (!(POSITIONS as readonly string[]).includes(part.kind)) continue;
              const v = content.types[type].positions[part.kind as (typeof POSITIONS)[number]].find((x) => x.id === part.variantId)!;
              expect(v.forma).toContain(forma);
              expect(v.delka).toContain(delka);
            }
          }
  });

  it("skládá pozice v pořadí a žádná část není prázdná", () => {
    const letter = composeLetter(base({ includeProcessBlock: true, customSentence: "  Moje věta.  ", senderName: "Jana Nováková" }), content);
    expect(letter.parts.map((p) => p.kind)).toEqual([
      "osloveni",
      "uvod",
      "jadro",
      "prechod",
      "zadost",
      "projednavani",
      "vlastni",
      "zaver",
      "podpis",
      "paticka",
    ]);
    for (const p of letter.parts) expect(p.text.trim().length).toBeGreaterThan(0);
    expect(letter.parts.find((p) => p.kind === "jadro")!.text).toBe(SENTENCES.join(" "));
    expect(letter.parts.find((p) => p.kind === "vlastni")!.text).toBe("Moje věta.");
    expect(letter.text).toContain("Jana Nováková\n\nPřipraveno pomocí Občanský kompas");
    expect(letter.text.endsWith("Připraveno pomocí Občanský kompas")).toBe(true);
  });

  it("patička je výchozí zapnutá a jde vypnout; blok o projednávání je volitelný", () => {
    expect(composeLetter(base(), content).parts.some((p) => p.kind === "paticka")).toBe(true);
    expect(composeLetter(base({ includeFooter: false }), content).parts.some((p) => p.kind === "paticka")).toBe(false);
    expect(composeLetter(base(), content).parts.some((p) => p.kind === "projednavani")).toBe(false);
  });

  it("zapnutí volitelných bloků nemění vybrané varianty pozic", () => {
    const a = composeLetter(base({ seed: 9 }), content);
    const b = composeLetter(base({ seed: 9, includeProcessBlock: true, customSentence: "X." }), content);
    expect(b.combinationKey).toBe(a.combinationKey);
  });

  it("jádro přebírá věty beze změny (varianty nemění fakta)", () => {
    for (let seed = 0; seed < 30; seed++) {
      const letter = composeLetter(base({ seed, forma: ((seed % 3) + 1) as 1 | 2 | 3 }), content);
      expect(letter.text).toContain(SENTENCES.join(" "));
    }
  });

  it("odmítne neplatné stupně", () => {
    expect(() => composeLetter(base({ forma: 4 as never }), content)).toThrow();
  });
});

/* ------------------------------------------------- pohlaví adresáta (§9.2, vlastník 2026-10-28) */

const SALUTATION: Record<(typeof PERSON_TYPES)[number], Record<Gender, string>> = {
  poslanec: { M: "Vážený pane poslanče,", Z: "Vážená paní poslankyně," },
  senator: { M: "Vážený pane senátore,", Z: "Vážená paní senátorko," },
  "ministr-kultury": { M: "Vážený pane ministře,", Z: "Vážená paní ministryně," },
  prezident: { M: "Vážený pane prezidente,", Z: "Vážená paní prezidentko," },
};
const GENDERS: Gender[] = ["M", "Z"];

describe("dopis podle pohlaví adresáta", () => {
  it.each(PERSON_TYPES.flatMap((t) => GENDERS.map((g) => [t, g] as const)))("%s × %s: oslovení odpovídá funkci a pohlaví", (type, g) => {
    // Běžný dopis (forma 2, délka 1–2) má jediné oslovení „Vážený pane … / Vážená paní …“.
    for (let seed = 0; seed < 10; seed++) {
      const l = composeLetter(base({ addressee: type, gender: g, seed }), content);
      expect(l.salutation).toBe(SALUTATION[type][g]);
      expect(l.parts[0]!.text).toBe(SALUTATION[type][g]);
      expect(l.gender).toBe(g);
    }
  });

  it("u známého pohlaví nezůstane žádný dvojznačný tvar ani tvar druhého pohlaví (všechny formy, délky, seedy)", () => {
    for (const type of PERSON_TYPES)
      for (const g of GENDERS)
        for (const forma of LEVELS)
          for (const delka of LEVELS)
            for (let seed = 0; seed < 25; seed++) {
              const l = composeLetter(base({ addressee: type, gender: g, forma, delka, seed, includeProcessBlock: true }), content);
              expect(l.text, `${type}/${g}/${forma}/${delka}/${seed}`).not.toMatch(AMBIGUOUS_GENDER_RE);
              if (g === "M") expect(l.salutation).not.toMatch(/paní/i);
              else expect(l.salutation).not.toMatch(/\bpane\b/i);
              expect(l.salutation).not.toBe("Dobrý den,");
            }
  });

  it("shoda v textu: prezident – „nepodepsal a vrátil“ / „nepodepsala a vrátila“, bez pohlaví neutrálně", () => {
    const find = (g: Gender | null) => {
      for (let seed = 0; seed < 500; seed++) {
        const l = composeLetter(base({ addressee: "prezident", gender: g, forma: 3, delka: 2, seed }), content);
        if (l.parts.find((p) => p.kind === "zadost")!.variantId === "zad-4") return l.text;
      }
      throw new Error("zad-4 nevybráno");
    };
    expect(find("M")).toMatch(/nepodepsal a vrátil/);
    expect(find("Z")).toMatch(/nepodepsala a vrátila/);
    const n = find(null);
    expect(n).toMatch(/nepodepisujte/);
    expect(n).not.toMatch(/nepodepsal/);
  });

  it("shoda v textu: poslanec – „byl zvolen“ / „byla zvolena“", () => {
    const uvod = (g: Gender) => {
      for (let seed = 0; seed < 500; seed++) {
        const l = composeLetter(base({ gender: g, forma: 3, seed }), content);
        const p = l.parts.find((x) => x.kind === "uvod")!;
        if (p.variantId === "uvod-3") return p.text;
      }
      throw new Error("uvod-3 nevybráno");
    };
    expect(uvod("M")).toMatch(/jste byl zvolen /);
    expect(uvod("Z")).toMatch(/jste byla zvolena /);
  });

  it("neznámé pohlaví → neutrální oslovení „Vážená paní, vážený pane,“", () => {
    for (const type of PERSON_TYPES)
      for (const forma of LEVELS)
        for (let seed = 0; seed < 10; seed++) {
          const l = composeLetter(base({ addressee: type, gender: null, forma, seed }), content);
          expect(l.salutation).toBe(content.common.osloveni_neutralni);
          expect(l.salutation).toBe("Vážená paní, vážený pane,");
          expect(l.gender).toBeNull();
        }
  });

  it("zastupitelstva: jedna ustálená formule oslovení, pohlaví se ignoruje", () => {
    for (const type of ["kraj", "obec"] as const)
      for (const forma of LEVELS)
        for (let seed = 0; seed < 10; seed++) {
          const a = composeLetter(base({ addressee: type, forma, seed }), content);
          const b = composeLetter(base({ addressee: type, forma, seed, gender: "Z" }), content);
          expect(b.text).toBe(a.text);
          expect(a.gender).toBeNull();
          expect(a.salutation).toMatch(/vážené zastupitelky, vážení zastupitelé/i);
        }
  });

  it("pohlaví nemění výběr variant (determinismus podle seedu)", () => {
    for (const type of PERSON_TYPES)
      for (let seed = 0; seed < 20; seed++) {
        const keys = [null, "M", "Z"].map((g) => composeLetter(base({ addressee: type, gender: g as Gender | null, seed }), content).combinationKey);
        expect(new Set(keys).size).toBe(1);
      }
  });
});

describe("schéma: pohlaví v šablonách", () => {
  const withType = (type: (typeof ADDRESSEE_TYPES)[number], mutate: (t: ReturnType<typeof structuredClone<(typeof content.types)["poslanec"]>>) => void) => {
    const raw = structuredClone(content.types[type]);
    mutate(raw);
    return () => parseLettersContent({ common: content.common, types: ADDRESSEE_TYPES.map((t) => (t === type ? raw : content.types[t])) });
  };

  it("odmítne dvojznačné tvary („nepodepsal/a“, „paní …, pane …“)", () => {
    expect(withType("prezident", (t) => (t.positions.zadost[0]!.text = "Prosím, abyste ho nepodepsal/a."))).toThrow(/dvojznačný/);
    expect(withType("kraj", (t) => (t.positions.osloveni[0]!.text = "Vážená paní hejtmanko, vážený pane hejtmane,"))).toThrow(/dvojznačný/);
  });

  it("oslovení osoby musí mít tvary m/z, zastupitelstvo nesmí", () => {
    expect(withType("senator", (t) => (t.positions.osloveni[0]!.text = "Dobrý den,"))).toThrow(/m\/z/);
    expect(withType("obec", (t) => (t.positions.uvod[0]!.text = { m: "A.", z: "B.", n: "C." }))).toThrow(/prostý/);
  });

  it("text podle pohlaví mimo oslovení musí mít neutrální znění n", () => {
    expect(withType("poslanec", (t) => (t.positions.zadost[0]!.text = { m: "Prosím pana.", z: "Prosím paní." }))).toThrow(/neutrální znění/);
  });

  it("adresát-osoba musí mít funkci do adresy", () => {
    expect(withType("ministr-kultury", (t) => delete t.funkce)).toThrow(/funkce/);
  });
});
