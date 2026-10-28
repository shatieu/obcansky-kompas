import { describe, expect, it } from "vitest";
import { composeLetter, countCombinations, eligibleVariants, mulberry32, type ComposeLetterInput } from "./compose";
import { loadLettersContent } from "./load";
import { ADDRESSEE_TYPES, LEVELS, POSITIONS, parseLettersContent } from "./schema";

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
    const texts = ADDRESSEE_TYPES.flatMap((t) => POSITIONS.flatMap((p) => content.types[t].positions[p].map((v) => v.text)));
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
