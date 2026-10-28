/**
 * SPEC §8 – srovnání (/v/{uuid}/srovnani) a otevřená data (CSV, kategorie pod 10 lidí sloučené).
 * Testuje čisté funkce compare() a toOpenDataCsv() a route GET /api/open-data.
 */
import { afterAll, describe, expect, it } from "vitest";
import { facts, questionsFile, ui } from "@/lib/content";
import { bandThresholds } from "@/lib/compose/q1";
import type { Answers } from "@/lib/compose/types";
import { aggregateRows, type StatsRow } from "@/lib/stats/aggregate";
import { compare, type OrgInput } from "@/lib/stats/compare";
import { toOpenDataCsv } from "@/lib/stats/csv";
import { optionIdByLabel, questionsYaml } from "./helpers/content";
import { withEnv } from "./helpers/runtime";

const file = questionsYaml();
const id = (qid: string, label: string) => optionIdByLabel(qid, label, file);
const t = bandThresholds(questionsFile, facts)!;
const row = (answers: Answers, verified = true): StatsRow => ({ answers, verified, region: null, ageGroup: null, municipalitySize: null });
const stats = (rows: StatsRow[]) => aggregateRows(rows, { filters: {}, thresholds: t, demo: false, source: "db" });

const USER: Answers = {
  q1: 7.8,
  q2: id("q2", "Poplatek jako dnes"),
  q3: id("q3", "Nevím"),
  q4: id("q4", "Každá domácnost"),
  q5: id("q5", "Ne, všichni stejně"),
  q6: id("q6", "Ano, méně"),
  q7: [id("q7", "Studenti")],
  q8: id("q8", "Ne"),
};

describe("§8 srovnání – % lidí se stejnou odpovědí", () => {
  it("u každé otázky spočítá podíl lidí se stejnou odpovědí", () => {
    const s = stats([
      row({ q2: id("q2", "Poplatek jako dnes") }),
      row({ q2: id("q2", "Poplatek jako dnes") }),
      row({ q2: id("q2", "Návrh vlády") }),
      row({ q2: id("q2", "Nevím") }),
    ]);
    const c = compare({ answers: USER, stats: s, organizations: [], questionsFile, thresholds: t });
    expect(c.questions.find((x) => x.questionId === "q2")!.percent).toBe(50);
  });

  it("Q1 se shoduje při stejném pásmu (7,8 a 7,82 = návrh vlády)", () => {
    const s = stats([row({ q1: 7.8 }), row({ q1: 7.82 }), row({ q1: 11 }), row({ q1: 6 })]);
    const c = compare({ answers: { q1: 7.8 }, stats: s, organizations: [], questionsFile, thresholds: t });
    expect(c.questions.find((x) => x.questionId === "q1")!.percent).toBe(50);
  });

  it("neověřené podpisy se do srovnání nepočítají", () => {
    const s = stats([row({ q2: id("q2", "Poplatek jako dnes") }), row({ q2: id("q2", "Návrh vlády") }, false)]);
    const c = compare({ answers: USER, stats: s, organizations: [], questionsFile, thresholds: t });
    expect(c.questions.find((x) => x.questionId === "q2")!.percent).toBe(100);
  });
});

describe("§8 shoda se stranami a hnutími", () => {
  const s = stats([]);
  const cmp = (orgs: OrgInput[], user: Answers = USER) => compare({ answers: user, stats: s, organizations: orgs, questionsFile, thresholds: t }).organizations;

  it("shoda = podíl otázek se stejnou odpovědí", () => {
    const org: Answers = { ...USER, q3: id("q3", "Zákon, s růstem podle inflace"), q4: id("q4", "Každý dospělý") };
    const [r] = cmp([{ name: "Strana A", answers: org }]);
    // USER q3 = Nevím → nepočítá se. Srovnává se q1,q2,q4,q5,q6,q7,q8 = 7, shoda 6 (q4 se liší).
    expect(r!.compared).toBe(7);
    expect(r!.matches).toBe(6);
    expect(r!.percent).toBe(Math.round((6 / 7) * 100));
  });

  it("„Nevím“ na straně subjektu se nepočítá", () => {
    const org: Answers = { ...USER, q2: id("q2", "Nevím") };
    const [r] = cmp([{ name: "Hnutí B", answers: org }]);
    expect(r!.compared).toBe(6);
    expect(r!.matches).toBe(6);
  });

  it("zašedlé otázky se nepočítají (Q2 = Jen dobrovolné příspěvky u obou → jen Q1, Q2)", () => {
    const user: Answers = { q1: 6, q2: id("q2", "Jen dobrovolné příspěvky") };
    const org: Answers = { q1: 6.1, q2: id("q2", "Jen dobrovolné příspěvky"), q5: id("q5", "Ne, všichni stejně") };
    const [r] = cmp([{ name: "X", answers: org }], user);
    expect(r!.compared).toBe(2);
    expect(r!.matches).toBe(2);
    expect(r!.percent).toBe(100);
  });

  it("Q1 se shoduje při stejném pásmu, ne při stejné částce", () => {
    const sameBand = cmp([{ name: "A", answers: { q1: 11.5 } }], { q1: 10.5 })[0]!;
    const otherBand = cmp([{ name: "A", answers: { q1: 6.0 } }], { q1: 8.5 })[0]!;
    expect(sameBand.matches).toBe(1);
    expect(otherBand.matches).toBe(0);
  });

  it("řazení abecedně podle české abecedy (Ch po H)", () => {
    const names = ["Iniciativa C", "Chytré hnutí", "Hnutí B", "Strana A", "Čestná strana"];
    const r = cmp(names.map((name) => ({ name, answers: USER })));
    expect(r.map((x) => x.name)).toEqual(["Čestná strana", "Hnutí B", "Chytré hnutí", "Iniciativa C", "Strana A"]);
  });

  it("subjekt bez odpovědi je uvedený jako neodpověděl, bez procenta", () => {
    const [r] = cmp([{ name: "Strana A", answers: null }]);
    expect(r!.answered).toBe(false);
    expect(r!.percent).toBeNull();
  });
});

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    out.push(row);
  }
  return out;
}

describe("§8 otevřená data – kategorie pod 10 lidí sloučené", () => {
  const rows: StatsRow[] = [
    ...Array.from({ length: 40 }, () => row({ q2: id("q2", "Poplatek jako dnes") })),
    ...Array.from({ length: 12 }, () => row({ q2: id("q2", "Návrh vlády") })),
    ...Array.from({ length: 4 }, () => row({ q2: id("q2", "Jen dobrovolné příspěvky") })),
    ...Array.from({ length: 3 }, () => row({ q2: id("q2", "Nevím") })),
    ...Array.from({ length: 5 }, () => row({ q2: id("q2", "Státní rozpočet bez pojistek") })),
    ...Array.from({ length: 2 }, () => row({ q4: id("q4", "Každý dospělý") })),
  ];
  const csv = toOpenDataCsv(stats(rows), questionsFile, { merged: ui.stats.merged_label, hiddenCount: ui.stats.hidden_count });
  const table = parseCsv(csv);
  const header = table[0]!;
  const countCol = header.findIndex((h) => /pocet|počet|count/i.test(h));

  it("CSV má hlavičku se sloupcem počtu", () => expect(countCol).toBeGreaterThanOrEqual(0));

  it("žádný zveřejněný počet není mezi 1 a 9", () => {
    for (const r of table.slice(1)) {
      const n = Number(r[countCol]);
      if (Number.isFinite(n)) expect(n === 0 || n >= 10, r.join(",")).toBe(true);
    }
  });

  it("malé kategorie Q2 (4 + 3 + 5 = 12) jsou sloučené do jednoho řádku", () => {
    const merged = table.slice(1).filter((r) => r[0] === "q2" && !r.some((c) => /Poplatek jako dnes|Návrh vlády/.test(c)));
    expect(merged).toHaveLength(1);
    expect(Number(merged[0]![countCol])).toBe(12);
  });

  it("jediná malá kategorie (Q4, 2 lidé) nezveřejní přesný počet", () => {
    for (const r of table.slice(1).filter((x) => x[0] === "q4")) expect(r[countCol]).not.toBe("2");
  });

  it("jednotlivé malé volby se v CSV neobjeví", () => {
    expect(csv).not.toContain("Jen dobrovolné příspěvky");
    expect(csv).not.toContain("Státní rozpočet bez pojistek");
  });
});

describe("§8 GET /api/open-data", () => {
  const restore = withEnv({ STATIC_DEMO: "1", DATABASE_URL: undefined });
  afterAll(restore);
  it("vrátí CSV ke stažení a všechny počty jsou 0 nebo ≥ 10", async () => {
    const { GET } = await import("@/app/api/open-data/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    const table = parseCsv((await res.text()).replace(/^﻿/, ""));
    const countCol = table[0]!.findIndex((h) => /pocet|počet|count/i.test(h));
    for (const r of table.slice(1)) {
      const n = Number(r[countCol]);
      if (Number.isFinite(n)) expect(n === 0 || n >= 10).toBe(true);
    }
  });
});
