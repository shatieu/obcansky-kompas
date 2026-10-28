/**
 * SPEC §6 – text k podpisu: deterministické skládání, věty s ID a verzí, pásma Q1 s částkou,
 * „Nevím“, content_version, čistá funkce sdílená klientem i serverem.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeStatement, currentContentVersion } from "@/lib/compose";
import type { Answers } from "@/lib/compose/types";
import { optionIdByLabel, questionsYaml, readYaml, ROOT } from "./helpers/content";

const file = questionsYaml();
const id = (qid: string, label: string) => optionIdByLabel(qid, label, file);
const V = currentContentVersion();

interface S {
  id: string;
  version: number;
  text: string;
  band?: string;
}
const sentencesYaml = readYaml<{
  version: string;
  intro: S;
  outro: S;
  nevim: S;
  q1: S[];
  options: Record<string, { version: number; text?: string; fragment?: string }>;
}>("sentences.yaml");
const facts = readYaml<{ id: string; value: number | null }[]>("facts.yaml");
const gov = facts.find((f) => f.id === "gov-proposal-total-bn")!.value!;
const today = facts.find((f) => f.id === "today-total-bn")!.value!;

const FULL: Answers = {
  q1: 9.0,
  q2: id("q2", "Poplatek jako dnes"),
  q3: id("q3", "Nezávislá komise na několik let"),
  q4: id("q4", "Každá domácnost"),
  q5: id("q5", "Stejně, ale se slevami"),
  q6: id("q6", "Ano, méně"),
  q7: [id("q7", "Studenti"), id("q7", "Lidé se zdravotním postižením")],
  q8: id("q8", "Jen velké firmy"),
};

describe("§6 skládání textu", () => {
  it("je deterministické: stejné odpovědi → stejný text (i při jiném pořadí klíčů)", () => {
    const a = composeStatement(FULL, V).text;
    const reversed = Object.fromEntries(Object.entries(FULL).reverse()) as Answers;
    expect(composeStatement(FULL, V).text).toBe(a);
    expect(composeStatement(reversed, V).text).toBe(a);
  });

  it("pevný úvod + jedna věta za každou zodpovězenou otázku + pevný závěr", () => {
    const s = composeStatement(FULL, V);
    expect(s.text.startsWith(sentencesYaml.intro.text)).toBe(true);
    expect(s.text.endsWith(sentencesYaml.outro.text)).toBe(true);
    expect(s.parts).toHaveLength(8 + 2);
  });

  it("nezodpovězené otázky větu nemají", () => {
    const s = composeStatement({ q2: id("q2", "Poplatek jako dnes") }, V);
    expect(s.parts).toHaveLength(3);
    expect(s.text).toContain(sentencesYaml.options[id("q2", "Poplatek jako dnes")]!.text!);
  });

  it("každá volba Q2–Q8 (kromě Nevím) má v sentences.yaml větu s verzí", () => {
    for (const q of file.questions.filter((x) => x.type !== "slider"))
      for (const o of q.options.filter((x) => !x.nevim)) {
        const s = sentencesYaml.options[o.id];
        expect(s, o.id).toBeDefined();
        expect(s!.version).toBeGreaterThanOrEqual(1);
        expect(Boolean(s!.text || s!.fragment)).toBe(true);
      }
  });

  it("každá věta v textu nese id a verzi", () => {
    for (const p of composeStatement(FULL, V).parts) {
      expect(p.sentenceId).toBeTruthy();
      expect(p.sentenceVersion).toBeGreaterThanOrEqual(1);
    }
  });

  it("text obsahuje větu každé zvolené volby", () => {
    const s = composeStatement(FULL, V).text;
    for (const qid of ["q2", "q3", "q4", "q5", "q6", "q8"] as const)
      expect(s).toContain(sentencesYaml.options[FULL[qid] as string]!.text!);
    expect(s).toContain(sentencesYaml.options[id("q7", "Studenti")]!.fragment!);
  });

  it("„Nevím“ = „V otázce [téma] nechávám rozhodnutí na odbornících.“", () => {
    const s = composeStatement({ q3: id("q3", "Nevím") }, V);
    const topic = file.questions.find((q) => q.id === "q3")!.topic;
    expect(s.text).toContain(`V otázce ${topic} nechávám rozhodnutí na odbornících.`);
  });

  it("věty „Nevím“ lze skrýt", () => {
    const answers: Answers = { q2: id("q2", "Poplatek jako dnes"), q3: id("q3", "Nevím") };
    const shown = composeStatement(answers, V);
    const hidden = composeStatement(answers, V, { hideUnknown: true });
    expect(hidden.parts.length).toBe(shown.parts.length - 1);
    expect(hidden.text).not.toContain("nechávám rozhodnutí na odbornících");
  });

  it("zašedlé (odpadlé) otázky do textu nejdou", () => {
    const s = composeStatement({ q2: id("q2", "Jen dobrovolné příspěvky"), q5: id("q5", "Ano, s horní hranicí") }, V);
    expect(s.text).not.toContain(sentencesYaml.options[id("q5", "Ano, s horní hranicí")]!.text!);
  });

  it("uložená content_version = verze sentences.yaml; neznámá verze se odmítne", () => {
    expect(composeStatement(FULL, V).contentVersion).toBe(sentencesYaml.version);
    expect(() => composeStatement(FULL, "neexistuje-0")).toThrow();
  });
});

describe("§6 Q1 – pásma a částka", () => {
  const bandOf = (value: number) => {
    const s = composeStatement({ q1: value }, V);
    const part = s.parts.find((p) => p.questionId === "q1")!;
    return { part, band: sentencesYaml.q1.find((x) => x.id === part.sentenceId)?.band };
  };
  it("sentences.yaml má 5 pásem: pod návrhem / návrh / mezi / dnes / nad dnes", () => {
    expect(sentencesYaml.q1.map((s) => s.band)).toHaveLength(5);
    for (const s of sentencesYaml.q1) expect(s.text).toContain("{amount}");
  });
  const cases: [string, number][] = [
    ["pod návrhem vlády", Math.max(5, Math.round((gov - 1) * 10) / 10)],
    ["návrh vlády", Math.round(gov * 10) / 10],
    ["mezi", Math.round(((gov + today) / 2) * 10) / 10],
    ["dnes", Math.round(today * 10) / 10],
    ["nad dnes", Math.min(12, Math.round((today + 1.5) * 10) / 10)],
  ];
  it("pět hodnot ze SPEC pásem padne do pěti různých pásem v pořadí", () => {
    const bands = cases.map(([, v]) => bandOf(v).band);
    expect(new Set(bands).size).toBe(5);
    expect(bands).toEqual(sentencesYaml.q1.map((s) => s.band));
  });
  for (const [name, value] of cases)
    it(`${name} (${value} mld): věta doplní částku`, () => {
      const { part } = bandOf(value);
      const amount = String(value).replace(".", ",");
      expect(part.text).toContain(amount);
      expect(part.text).not.toContain("{amount}");
    });
  it("Q1 „Nevím“ dává větu Nevím, ne pásmo", () => {
    const s = composeStatement({ q1: id("q1", "Nevím") }, V);
    expect(s.text).toContain("nechávám rozhodnutí na odbornících");
  });
});

describe("§6 čistá funkce sdílená klientem i serverem", () => {
  it("lib/compose nepoužívá node: moduly ani síť/čas/náhodu", () => {
    for (const f of ["index.ts", "engine.ts", "q1.ts"]) {
      const src = readFileSync(path.join(ROOT, "lib", "compose", f), "utf8");
      expect(src, f).not.toMatch(/from\s+["']node:/);
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date\(|fetch\(/);
    }
  });
});
