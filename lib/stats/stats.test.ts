import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { facts, questionsFile, ui } from "@/lib/content";
import { bandThresholds } from "@/lib/compose/q1";
import { createSql } from "@/lib/db/client";
import { startPgliteServer, type DevDbServer } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { generateSeed } from "@/lib/seed/generate";
import { clearSeed, insertSeed } from "@/lib/seed/insert";
import { aggregateRows, type StatsFilters, type StatsRow } from "./aggregate";
import { compare } from "./compare";
import { toOpenDataCsv } from "./csv";
import { queryStats } from "./query";

const thresholds = bandThresholds(questionsFile, facts);
const seed = generateSeed(questionsFile, facts);
const rows: StatsRow[] = seed.signatures.map((s) => ({
  answers: s.answers,
  verified: s.verified,
  region: s.region,
  ageGroup: s.ageGroup,
  municipalitySize: s.municipalitySize,
}));
const now = new Date("2026-10-28T00:00:00Z");

describe("seed", () => {
  it("je deterministický a různorodý", () => {
    const again = generateSeed(questionsFile, facts);
    expect(again.signatures).toEqual(seed.signatures);
    expect(seed.signatures).toHaveLength(500);
    expect(new Set(seed.signatures.map((s) => s.answers.q2)).size).toBeGreaterThanOrEqual(7);
    expect(seed.signatures.every((s) => s.signer.email.endsWith("@example.invalid"))).toBe(true);
    expect(seed.organizations.map((o) => o.name)).toEqual(["Strana A", "Hnutí B", "Iniciativa C"]);
  });
});

describe("statistiky v DB (PGlite přes pglite-socket + driver postgres)", () => {
  let srv: DevDbServer;
  let sql: postgres.Sql;

  beforeAll(async () => {
    srv = await startPgliteServer({ port: 0 });
    sql = createSql(srv.url, { max: 2 });
    await runMigrations(sql);
    await insertSeed(sql, seed);
  });
  afterAll(async () => {
    await sql?.end();
    await srv?.stop();
  });

  it("všechny tabulky ve schématu app mají zapnuté RLS", async () => {
    const r = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relkind = 'r' order by 1`;
    expect(r.map((x) => x.relname)).toEqual([
      "email_job", "email_token", "event_counter", "organization", "rate_limit", "signature", "signature_version", "signer",
    ]);
    expect(r.every((x) => x.relrowsecurity)).toBe(true);
    const policies = await sql`select 1 from pg_policies where schemaname = 'app'`;
    expect(policies).toHaveLength(0);
  });

  it("osobní údaje jsou v DB jen šifrované", async () => {
    const [s] = await sql<{ name_enc: string; email_enc: string }[]>`select name_enc, email_enc from app.signer limit 1`;
    expect(s!.name_enc.startsWith("v1:")).toBe(true);
    expect(s!.email_enc).not.toContain("@");
  });

  const filterCases: StatsFilters[] = [
    {},
    { region: "CZ010" },
    { ageGroup: "60+" },
    { municipalitySize: "do-2000", ageGroup: "30-44" },
  ];
  for (const filters of filterCases) {
    it(`SQL agregace = TS agregace (${JSON.stringify(filters)})`, async () => {
      const fromSql = await queryStats(sql, { filters, thresholds, includeSeed: true, now });
      const fromTs = aggregateRows(rows, { filters, thresholds, demo: true, source: "db", now });
      expect(fromSql).toEqual(fromTs);
      expect(fromSql.verified + fromSql.pending).toBeGreaterThan(0);
    });
  }

  it("bez DEMO_MODE se seed nepočítá", async () => {
    const s = await queryStats(sql, { filters: {}, thresholds, includeSeed: false, now });
    expect(s.verified).toBe(0);
    expect(s.pending).toBe(0);
  });

  it("seed:clear smaže seed", async () => {
    const r = await clearSeed(sql);
    expect(r).toEqual({ signatures: 500, organizations: 3 });
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from app.signer`;
    expect(row!.n).toBe(0);
  });
});

describe("srovnání (SPEC §8)", () => {
  const stats = aggregateRows(rows, { filters: {}, thresholds, demo: true, source: "snapshot", now });

  it("% lidí se stejnou odpovědí", () => {
    const c = compare({ answers: { q2: "q2-opt1", q4: "q4-opt1" }, stats, organizations: [], questionsFile, thresholds });
    const q2 = c.questions.find((q) => q.questionId === "q2")!;
    expect(q2.same).toBe(stats.questions.q2.counts["q2-opt1"]);
    expect(q2.percent).toBe(Math.round((q2.same / stats.questions.q2.total) * 100));
    expect(c.questions.find((q) => q.questionId === "q3")!.percent).toBeNull();
  });

  it("Q1 se shoduje při stejném pásmu, Q7 při stejné sadě", () => {
    const t = thresholds!;
    const c = compare({
      answers: { q1: t.gov, q7: ["q7-opt2", "q7-opt1"] },
      stats,
      organizations: [{ name: "X", answers: { q1: t.gov + 0.01, q7: ["q7-opt1", "q7-opt2"] } }],
      questionsFile,
      thresholds,
    });
    const byId = (qid: string) => c.questions.find((q) => q.questionId === qid)!;
    expect(byId("q1").key).toBe("gov");
    expect(byId("q7").key).toBe("q7-opt1+q7-opt2");
    // Řádky srovnání jdou v pořadí zobrazení (otázka na peníze na konci).
    expect(c.questions.map((q) => q.questionId)).toEqual(questionsFile.order);
    expect(c.organizations[0]).toMatchObject({ compared: 2, matches: 2, percent: 100 });
  });

  it("Nevím a zašedlé otázky se nepočítají, řazení abecedně, neodpovězené subjekty", () => {
    const c = compare({
      answers: { q2: "q2-opt6", q1: "q1-nevim" },
      stats,
      organizations: [
        { name: "Žlutá strana", answers: { q2: "q2-opt6", q3: "q3-opt1", q1: 8 } },
        { name: "Hnutí B", answers: { q2: "q2-opt1" } },
        { name: "Čeští zelení", answers: null },
      ],
      questionsFile,
      thresholds,
    });
    expect(c.organizations.map((o) => o.name)).toEqual(["Čeští zelení", "Hnutí B", "Žlutá strana"]);
    expect(c.organizations[0]).toMatchObject({ answered: false, percent: null });
    expect(c.organizations[1]).toMatchObject({ compared: 1, matches: 0, percent: 0 });
    // q3 je u uživatele (Q2 = dobrovolné) zašedlé, q1 = Nevím → srovnává se jen q2.
    expect(c.organizations[2]).toMatchObject({ compared: 1, matches: 1, percent: 100 });
  });
});

describe("otevřená data CSV", () => {
  it("slučuje kategorie pod 10 a nic pod 10 nezveřejní", () => {
    const stats = aggregateRows(rows.slice(0, 60), { filters: {}, thresholds, demo: true, source: "snapshot", now });
    const csv = toOpenDataCsv(stats, questionsFile, { merged: ui.stats.merged_label, hiddenCount: ui.stats.hidden_count });
    const lines = csv.trim().split("\n").slice(1);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, ""));
      const n = cells[4]!;
      if (/^\d+$/.test(n)) expect(Number(n)).toBeGreaterThanOrEqual(10);
    }
    expect(csv).toContain(ui.stats.merged_label);
  });
});
