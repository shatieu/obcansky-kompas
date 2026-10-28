/**
 * SPEC §3 (struktura content/), §4.1 (limity textu), §5.1 (otázky a volby), §9.3 (slogany),
 * §11.4 (citace max. 15 slov). Limity se počítají nezávisle na implementaci lint:content.
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import {
  CONTENT_DIR,
  copyContentToTemp,
  flattenStrings,
  listYaml,
  questionsYaml,
  readYaml,
  sentences,
  words,
  type QFile,
} from "./helpers/content";
import { runScript } from "./helpers/runtime";

const q = questionsYaml();
const ui = readYaml<Record<string, unknown>>("ui.yaml");
const uiStrings = flattenStrings(ui);
const stance = readYaml<{ title: string; text: string; actions: { label: string; href: string }[] }>("stance.yaml");

const isHeading = (k: string) => /(^|\.)title$|_title$/.test(k);
const isLead = (k: string) => /(^|\.)lead$|_lead$/.test(k);
const isButton = (k: string) => /_button$/.test(k);

describe("§3 struktura obsahu", () => {
  const required = [
    "questions.yaml",
    "sentences.yaml",
    "share.yaml",
    "slogans.yaml",
    "ui.yaml",
    "stance.yaml",
    "plain-language.yaml",
    "law/compatibility.yaml",
  ];
  for (const f of required) it(`content/${f} existuje`, () => expect(existsSync(path.join(CONTENT_DIR, f))).toBe(true));
  for (const d of ["explainers", "letters", "law", "verification"])
    it(`content/${d}/ existuje a není prázdná`, () => expect(existsSync(path.join(CONTENT_DIR, d))).toBe(true));
});

describe("§5.1 otázky a volby", () => {
  const SPEC: Record<string, { text: string; options: string[] }> = {
    q1: { text: "Kolik peněz ročně má ČT a ČRo dostat?", options: ["Nevím"] },
    q2: {
      text: "Odkud mají peníze jít?",
      options: [
        "Poplatek jako dnes",
        "Zvláštní poplatek přes daně",
        "Státní rozpočet s pojistkami",
        "Návrh vlády",
        "Státní rozpočet bez pojistek",
        "Jen dobrovolné příspěvky",
        "Nevím",
      ],
    },
    q3: {
      text: "Kdo určí, kolik dostanou?",
      options: ["Zákon, s růstem podle inflace", "Vláda a poslanci každý rok", "Nezávislá komise na několik let", "Nevím"],
    },
    q4: { text: "Kdo má platit?", options: ["Každá domácnost", "Každý dospělý", "Nikdo zvlášť, ze všech daní", "Nevím"] },
    q5: {
      text: "Má záležet na příjmu?",
      options: ["Ne, všichni stejně", "Ano, s horní hranicí", "Ano, bez horní hranice", "Stejně, ale se slevami", "Nevím"],
    },
    q6: { text: "Mají platit důchodci?", options: ["Ano, stejně", "Ano, méně", "Ne", "Nevím"] },
    q7: {
      text: "Kdo nemá platit?",
      options: ["Lidé s nízkým příjmem", "Studenti", "Lidé se zdravotním postižením", "Lidé v hmotné nouzi", "Platí všichni", "Nevím"],
    },
    q8: {
      text: "Mají platit firmy?",
      options: ["Ne", "Podle počtu zaměstnanců", "Podle zisku, s horní hranicí", "Podle obratu, s horní hranicí", "Jen velké firmy", "Nevím"],
    },
  };

  it("je přesně 8 otázek q1–q8", () => {
    expect(q.questions.map((x) => x.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"]);
  });
  for (const [qid, spec] of Object.entries(SPEC)) {
    it(`${qid}: text a volby odpovídají SPEC v pořadí`, () => {
      const question = q.questions.find((x) => x.id === qid)!;
      expect(question.text).toBe(spec.text);
      expect(question.options.map((o) => o.label)).toEqual(spec.options);
    });
    it(`${qid}: má právě jednu volbu „Nevím“`, () => {
      const question = q.questions.find((x) => x.id === qid)!;
      expect(question.options.filter((o) => o.label === "Nevím")).toHaveLength(1);
    });
  }
  it("Q1 je posuvník 5,0–12,0 mld, krok 0,1, s kotvami Návrh vlády / Dnes / Dnes +10 %", () => {
    const q1 = q.questions.find((x) => x.id === "q1")!;
    expect(q1.type).toBe("slider");
    expect(q1.slider).toMatchObject({ min: 5, max: 12, step: 0.1 });
    expect(q1.anchors!.map((a) => a.label)).toEqual(["Návrh vlády", "Dnes", "Dnes +10 %"]);
  });
  it("Q1 kotvy jsou tvrzení se zdrojem (facts), ne konstanty", () => {
    const facts = readYaml<{ id: string; source_url: string; value: number | null }[]>("facts.yaml");
    for (const a of q.questions.find((x) => x.id === "q1")!.anchors!) {
      const f = facts.find((x) => x.id === a.fact);
      expect(f, `fakt ${a.fact}`).toBeDefined();
      expect(f!.source_url).toMatch(/^https?:\/\//);
    }
    expect(facts.find((x) => x.id === "adults-count")?.source_url).toMatch(/^https?:\/\//);
  });
  it("Q7 je s více volbami", () => {
    expect(q.questions.find((x) => x.id === "q7")!.type).toBe("multi");
  });
  it("demografie: 14 krajů, 4 věkové skupiny, 4 velikosti obce, komentář max. 500 znaků (§5.3)", () => {
    const d = readYaml<{ demographics: { regions: unknown[]; age_groups: { label: string }[]; municipality_sizes: { label: string }[]; comment_max: number } }>(
      "questions.yaml",
    ).demographics;
    expect(d.regions).toHaveLength(14);
    expect(d.age_groups.map((a) => a.label)).toEqual(["18–29", "30–44", "45–59", "60+"]);
    expect(d.municipality_sizes).toHaveLength(4);
    expect(d.comment_max).toBe(500);
  });
});

describe("§4.1 limity textu – otázky a volby", () => {
  for (const question of q.questions) {
    it(`${question.id}: otázka max. 8 slov`, () => expect(words(question.text)).toBeLessThanOrEqual(8));
    for (const o of question.options) {
      it(`${o.id}: volba max. 6 slov a 40 znaků („${o.label}“)`, () => {
        expect(words(o.label)).toBeLessThanOrEqual(6);
        expect(o.label.length).toBeLessThanOrEqual(40);
      });
    }
    for (const a of question.anchors ?? [])
      it(`${question.id}.${a.id}: kotva max. 6 slov`, () => expect(words(a.label)).toBeLessThanOrEqual(6));
  }
});

describe("§4.1 limity textu – ui.yaml a stance.yaml", () => {
  it("ui.yaml obsahuje nadpisy, texty pod nadpisem i tlačítka (jinak by test nic nekontroloval)", () => {
    expect(uiStrings.some(([k]) => isHeading(k))).toBe(true);
    expect(uiStrings.some(([k]) => isLead(k))).toBe(true);
    expect(uiStrings.some(([k]) => isButton(k))).toBe(true);
  });
  // §13 předepisuje otázku na hlavní stránce doslova – limit nadpisu se na ni nevztahuje.
  const SPEC_MANDATED = new Set(["home.title"]);
  for (const [k, v] of uiStrings) {
    if (isHeading(k) && !SPEC_MANDATED.has(k))
      it(`ui.${k}: nadpis max. 8 slov`, () => expect(words(v)).toBeLessThanOrEqual(8));
    if (isLead(k))
      it(`ui.${k}: text pod nadpisem max. 1 věta a 120 znaků`, () => {
        expect(sentences(v).length).toBeLessThanOrEqual(1);
        expect(v.length).toBeLessThanOrEqual(120);
      });
    if (isButton(k)) it(`ui.${k}: tlačítko max. 3 slova („${v}“)`, () => expect(words(v)).toBeLessThanOrEqual(3));
  }
  it("§13 otázka na hlavní stránce je doslova ze SPEC", () => {
    expect(uiStrings.map(([, v]) => v)).toContain("Jak by se měla platit veřejnoprávní média?");
  });
  it("stance.yaml: nadpis max. 8 slov, věta max. 1 věta / 120 znaků, tlačítka max. 3 slova (§9.1)", () => {
    expect(words(stance.title)).toBeLessThanOrEqual(8);
    expect(sentences(stance.text)).toHaveLength(1);
    expect(stance.text.length).toBeLessThanOrEqual(120);
    for (const a of stance.actions) expect(words(a.label)).toBeLessThanOrEqual(3);
  });
  it("blok postoje má tlačítka Napsat zástupcům (/akce) a Profilová fotka (/fotka) (§9.1)", () => {
    expect(stance.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Napsat zástupcům", href: "/akce" }),
        expect.objectContaining({ label: "Profilová fotka", href: "/fotka" }),
      ]),
    );
  });
  it("slogany jsou přesně tři ze SPEC §9.3", () => {
    const s = readYaml<{ slogans: { text: string }[] }>("slogans.yaml").slogans.map((x) => x.text).sort();
    expect(s).toEqual(["Média nedáme", "Média veřejné služby mi nejsou jedno", "Ruce pryč od médií"].sort());
  });
  it("§14.4 souhlas se zpracováním politického názoru má text v ui.yaml", () => {
    expect(uiStrings.some(([, v]) => /politick/i.test(v) && /souhlas/i.test(v))).toBe(true);
  });
  it("§4.3 žádné emoji v textech UI", () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const [k, v] of uiStrings) expect(emoji.test(v), `ui.${k}`).toBe(false);
  });
});

describe("§4.1 / §11.4 limity textu – vysvětlivky", () => {
  const files = listYaml("explainers").filter((f) => /^q[1-8](-opt\d+)?\.yaml$/.test(f));
  it("každá volba (kromě Nevím) i každá otázka má soubor vysvětlivky (§5, §11)", () => {
    const ids = new Set(files.map((f) => f.replace(/\.yaml$/, "")));
    for (const question of q.questions) {
      expect(ids.has(question.id), question.id).toBe(true);
      for (const o of question.options) if (!o.nevim && question.type !== "slider") expect(ids.has(o.id), o.id).toBe(true);
    }
  });
  for (const f of files) {
    const e = readYaml<{ text: string; pro?: string; proti?: string; claims?: { quote?: string | null }[] }>(`explainers/${f}`);
    it(`${f}: max. 4 věty, každá max. 20 slov`, () => {
      const ss = sentences(e.text);
      expect(ss.length).toBeLessThanOrEqual(4);
      for (const s of ss) expect(words(s), s).toBeLessThanOrEqual(20);
    });
    it(`${f}: citace max. 15 slov`, () => {
      for (const c of e.claims ?? []) if (c.quote) expect(words(c.quote)).toBeLessThanOrEqual(15);
    });
    if (f.includes("-opt"))
      it(`${f}: pro i proti jsou jedna věta, délka se liší max. o 20 % (§11.1, §11.2/4)`, () => {
        expect(e.pro && e.proti).toBeTruthy();
        expect(sentences(e.pro!)).toHaveLength(1);
        expect(sentences(e.proti!)).toHaveLength(1);
        const a = e.pro!.length;
        const b = e.proti!.length;
        expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThanOrEqual(0.2);
      });
  }
});

describe("§4.1 vynucení: pnpm lint:content", () => {
  it("projde na obsahu v repozitáři", () => {
    const r = runScript("scripts/lint-content.ts");
    expect(r.status, r.stderr || r.stdout).toBe(0);
  });

  it("selže, když je otázka delší než 8 slov (build pak selže)", () => {
    const tmp = copyContentToTemp();
    const file = path.join(tmp.content, "questions.yaml");
    const data = readYaml<QFile>("questions.yaml", tmp.content);
    data.questions[1]!.text = "Odkud přesně mají peníze pro Českou televizi a Český rozhlas jít?";
    writeFileSync(file, stringify(data), "utf8");
    const r = runScript("scripts/lint-content.ts", { cwd: tmp.root });
    expect(r.status).not.toBe(0);
  });

  it("selže, když má volba víc než 40 znaků", () => {
    const tmp = copyContentToTemp();
    const file = path.join(tmp.content, "questions.yaml");
    const data = readYaml<QFile>("questions.yaml", tmp.content);
    data.questions[2]!.options[0]!.label = "Zákonem stanovenou částkou s ročním růstem";
    writeFileSync(file, stringify(data), "utf8");
    const r = runScript("scripts/lint-content.ts", { cwd: tmp.root });
    expect(r.status).not.toBe(0);
  });

  it("selže, když má tlačítko víc než 3 slova", () => {
    const tmp = copyContentToTemp();
    const file = path.join(tmp.content, "ui.yaml");
    const data = readYaml<Record<string, Record<string, string>>>("ui.yaml", tmp.content);
    data.compass!.next_button = "Pokračovat na další otázku";
    writeFileSync(file, stringify(data), "utf8");
    const r = runScript("scripts/lint-content.ts", { cwd: tmp.root });
    expect(r.status).not.toBe(0);
  });

  it("selže, když má vysvětlivka víc než 4 věty", () => {
    const tmp = copyContentToTemp();
    const f = listYaml("explainers", tmp.content).find((x) => /^q2-opt1\.yaml$/.test(x))!;
    const file = path.join(tmp.content, "explainers", f);
    const data = readYaml<{ text: string }>(`explainers/${f}`, tmp.content);
    data.text = "První věta. Druhá věta. Třetí věta. Čtvrtá věta. Pátá věta.";
    writeFileSync(file, stringify(data), "utf8");
    const r = runScript("scripts/lint-content.ts", { cwd: tmp.root });
    expect(r.status).not.toBe(0);
  });
});
