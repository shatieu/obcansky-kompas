/**
 * SPEC §9.2 – generátor dopisů: 3–5 variant na pozici, min. 100 různých kombinací na typ
 * adresáta, determinismus podle seedu, varianty mění formulace, nikdy fakta, patička.
 */
import { describe, expect, it } from "vitest";
import { ADDRESSEE_TYPES, AMBIGUOUS_GENDER_RE, PERSON_TYPES, composeLetter, textForms, type AddresseeType, type Delka, type Forma, type LetterText } from "@/lib/letters";
import { loadLettersContent } from "@/lib/letters/load";
import { listYaml, readYaml } from "./helpers/content";

const content = loadLettersContent();
const POS = ["osloveni", "uvod", "prechod", "zadost", "zaver"] as const;
const LEVELS = [1, 2, 3] as const;
interface V {
  id: string;
  forma: number[];
  delka: number[];
  text: LetterText;
}
const raw = Object.fromEntries(
  listYaml("letters")
    .filter((f) => f !== "_common.yaml")
    .map((f) => {
      const y = readYaml<{ type: string; positions: Record<string, V[]> }>(`letters/${f}`);
      return [y.type, y];
    }),
);

const STATEMENT = [
  "Takhle si představuji financování České televize a Českého rozhlasu.",
  "Peníze mají jít z poplatku jako dnes.",
  "Žádám, aby zákonodárci můj názor vzali v úvahu.",
];
const letter = (addressee: AddresseeType, seed: string | number, forma: Forma = 2, delka: Delka = 2, extra = {}) =>
  composeLetter({ addressee, statementSentences: STATEMENT, forma, delka, seed, ...extra }, content);

describe("§9.2 adresáti", () => {
  it("existují typy: poslanec, senátor, kraj, obec, ministr kultury, prezident", () => {
    expect(Object.keys(raw).sort()).toEqual(["kraj", "ministr-kultury", "obec", "poslanec", "prezident", "senator"]);
    expect([...ADDRESSEE_TYPES].sort()).toEqual(Object.keys(raw).sort());
  });
});

describe("§9.2 varianty a kombinace", () => {
  for (const [type, y] of Object.entries(raw)) {
    it(`${type}: každá pozice má 3–5 variant označených stupni`, () => {
      for (const p of POS) {
        const list = y.positions[p]!;
        expect(list.length, p).toBeGreaterThanOrEqual(3);
        expect(list.length, p).toBeLessThanOrEqual(5);
        for (const v of list) {
          expect(v.forma.length).toBeGreaterThan(0);
          expect(v.delka.length).toBeGreaterThan(0);
        }
      }
    });

    it(`${type}: min. 100 různých kombinací (spočteno z YAML)`, () => {
      const combos = new Set<string>();
      for (const f of LEVELS)
        for (const d of LEVELS) {
          const lists = POS.map((p) => y.positions[p]!.filter((v) => v.forma.includes(f) && v.delka.includes(d)).map((v) => v.id));
          const rec = (i: number, acc: string[]) => {
            if (i === lists.length) return void combos.add(acc.join("/"));
            for (const vid of lists[i]!) rec(i + 1, [...acc, vid]);
          };
          rec(0, []);
        }
      expect(combos.size).toBeGreaterThanOrEqual(100);
    });

    it(`${type}: každé nastavení posuvníků (3 × 3) má v každé pozici variantu`, () => {
      for (const f of LEVELS)
        for (const d of LEVELS)
          for (const p of POS) expect(y.positions[p]!.some((v) => v.forma.includes(f) && v.delka.includes(d)), `${p} f${f} d${d}`).toBe(true);
    });

    it(`${type}: varianty neobsahují čísla ani částky (mění formulace, ne fakta)`, () => {
      for (const p of POS) for (const v of y.positions[p]!) for (const t of textForms(v.text)) expect(t, `${p}/${v.id}`).not.toMatch(/\d/);
    });
  }
});

describe("§9.2 determinismus podle seedu", () => {
  for (const type of ADDRESSEE_TYPES) {
    it(`${type}: stejný seed a posuvníky → stejný dopis`, () => {
      expect(letter(type, "abc", 3, 1).text).toBe(letter(type, "abc", 3, 1).text);
    });
    it(`${type}: „Jiná varianta“ (jiný seed) dává jiné dopisy`, () => {
      const texts = new Set(Array.from({ length: 30 }, (_, i) => letter(type, `seed-${i}`).text));
      expect(texts.size).toBeGreaterThan(1);
    });
    it(`${type}: jádro z vět podepsaného textu je ve všech variantách stejné a doslovné`, () => {
      const cores = new Set<string>();
      for (let i = 0; i < 20; i++)
        for (const f of LEVELS)
          for (const d of LEVELS) {
            const l = letter(type, i, f, d);
            cores.add(l.parts.find((p) => p.kind === "jadro")!.text);
            for (const s of STATEMENT) expect(l.text).toContain(s);
          }
      expect(cores.size).toBe(1);
    });
  }
});

describe("§9.2 skladba dopisu", () => {
  it("oslovení → … → závěr, patička „Připraveno pomocí …“ ve výchozím stavu zapnutá", () => {
    const l = letter("poslanec", 1);
    expect(l.parts[0]!.kind).toBe("osloveni");
    expect(l.text).toMatch(/Připraveno pomocí/);
    expect(l.text).toMatch(/Občanský kompas/);
  });
  it("patička jde vypnout", () => {
    expect(letter("poslanec", 1, 2, 2, { includeFooter: false }).text).not.toMatch(/Připraveno pomocí/);
  });
  it("volitelný blok „Nesouhlasím se způsobem projednávání“ a vlastní věta", () => {
    const off = letter("senator", 7);
    const on = letter("senator", 7, 2, 2, { includeProcessBlock: true, customSentence: "Moje vlastní věta." });
    expect(on.parts.some((p) => p.kind === "projednavani")).toBe(true);
    expect(off.parts.some((p) => p.kind === "projednavani")).toBe(false);
    expect(on.text).toContain("Moje vlastní věta.");
  });
});

describe("§9.2 dopis konkrétnímu adresátovi (vlastník 2026-10-28)", () => {
  it("osoba: oslovení podle pohlaví z adresáře, žádné „paní …, pane …“ ani „…/a“", () => {
    for (const type of PERSON_TYPES)
      for (const gender of ["M", "Z"] as const)
        for (let seed = 0; seed < 15; seed++) {
          const l = letter(type, seed, ((seed % 3) + 1) as Forma, 2, { gender });
          expect(l.salutation).toMatch(gender === "Z" ? /paní/ : /pane/);
          expect(l.text).not.toMatch(AMBIGUOUS_GENDER_RE);
        }
  });
  it("neznámé pohlaví: neutrální „Vážená paní, vážený pane,“", () => {
    expect(letter("senator", 1, 2, 2, { gender: null }).salutation).toBe("Vážená paní, vážený pane,");
  });
  it("zastupitelstvo: „Vážené zastupitelky, vážení zastupitelé“", () => {
    for (const type of ["kraj", "obec"] as const) expect(letter(type, 3).salutation).toMatch(/vážené zastupitelky, vážení zastupitelé/i);
  });
});
