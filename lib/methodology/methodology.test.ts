import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { questionsFile, sentencesFile } from "@/lib/content";
import { claimHash } from "@/lib/content/verification";
import { countWords, splitSentences } from "@/lib/content/text";
import { loadPagesTexts } from "@/lib/org/texts";
import { branchingRules, sentenceLibrary } from "./library";
import { buildSourcesIndex, humanReviewedItems } from "./sources";

describe("knihovna vět", () => {
  it("obsahuje každou větu ze sentences.yaml s ID a verzí", () => {
    const ids = sentenceLibrary(sentencesFile, questionsFile).flatMap((g) => g.sentences.map((s) => s.id));
    const expected = [
      sentencesFile.intro.id,
      sentencesFile.outro.id,
      sentencesFile.nevim.id,
      ...sentencesFile.q1.map((s) => s.id),
      ...Object.values(sentencesFile.multi).map((s) => s.id),
      ...Object.keys(sentencesFile.options),
    ];
    expect(ids.sort()).toEqual(expected.sort());
  });
  it("pravidla větvení mají lidské popisky", () => {
    const rules = branchingRules(questionsFile);
    expect(rules.length).toBe(questionsFile.rules.length);
    const r = rules.find((x) => x.id === "q2-navrh-vlady")!;
    expect(r.option).toBe("Návrh vlády");
    expect(r.effects.some((e) => e.kind === "skip")).toBe(true);
  });
});

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "kompas-src-"));
  mkdirSync(path.join(dir, "explainers"));
  mkdirSync(path.join(dir, "verification", "reviews"), { recursive: true });
  const claim = (id: string, text: string) => ({ id, claim: text, source_url: "https://example.org", source_title: "Zdroj", locator: "str. 1" });
  writeFileSync(
    path.join(dir, "explainers", "q2.yaml"),
    `id: q2\ntext: Text.\nhuman_reviewed: true\nclaims:\n` +
      [claim("q2-c1", "První tvrzení."), claim("q2-c2", "Druhé tvrzení."), claim("q2-c3", "Třetí.")]
        .map((c) => `  - id: ${c.id}\n    claim: ${c.claim}\n    source_url: ${c.source_url}\n    source_title: ${c.source_title}\n    locator: ${c.locator}\n`)
        .join(""),
  );
  const rec = (id: string, verdict: string, round: number, hashOf: string, extra = {}) => ({
    claim_id: id,
    verdict,
    round,
    claim_hash: claimHash(hashOf),
    verifier: `v${round}`,
    checked_at: "2026-10-27T10:00:00Z",
    ...extra,
  });
  writeFileSync(
    path.join(dir, "verification", "q2-c1.json"),
    JSON.stringify([rec("q2-c1", "oprava", 1, "První tvrzení.", { correction: "Oprava" }), rec("q2-c1", "ano", 2, "První tvrzení.")]),
  );
  writeFileSync(path.join(dir, "verification", "q2-c2.json"), JSON.stringify(rec("q2-c2", "ano", 1, "Jiné znění.")));
  writeFileSync(
    path.join(dir, "facts.yaml"),
    `- id: f1\n  value: 1\n  unit: x\n  claim: Fakt.\n  source_url: https://example.org\n  source_title: Z\n  locator: L\n  status: researched\n`,
  );
  writeFileSync(path.join(dir, "verification", "f1.json"), JSON.stringify(rec("f1", "ne", 1, "Fakt.", { human_reviewed: true })));
  return dir;
}

describe("index zdrojů", () => {
  it("bere poslední kolo, hlídá změnu tvrzení a chybějící ověření", () => {
    const idx = buildSourcesIndex(fixture());
    const q2 = idx.groups.find((g) => g.id === "q2")!;
    expect(q2.shown).toBe(false); // chybí review a jedno tvrzení
    expect(q2.claims.map((c) => [c.id, c.state, c.round])).toEqual([
      ["q2-c1", "ano", 2],
      ["q2-c2", "changed", 1],
      ["q2-c3", "missing", null],
    ]);
    const f = idx.groups.find((g) => g.kind === "facts")!;
    expect(f.claims[0]).toMatchObject({ state: "ne", humanReviewed: true });
    expect(idx.totals).toEqual({ claims: 4, verified: 1, open: 3, humanReviewed: 1 });
    expect(humanReviewedItems(idx)).toEqual(["q2", "f1"]);
  });
  it("skutečný obsah: každé tvrzení z vysvětlivek i faktů je v indexu", () => {
    const idx = buildSourcesIndex();
    expect(idx.totals.claims).toBeGreaterThan(50);
    expect(idx.groups.some((g) => g.kind === "law")).toBe(true);
    expect(idx.groups.some((g) => g.kind === "facts")).toBe(true);
  });
});

describe("ui.yaml (stránky) – limity SPEC §4.1", () => {
  const texts = loadPagesTexts();
  const entries = Object.values(texts).flatMap((g) => Object.entries(g as Record<string, string>));
  it("nadpisy max. 8 slov", () => {
    for (const [k, v] of entries) if (k === "title" || k.endsWith("_title")) expect(countWords(v), k).toBeLessThanOrEqual(8);
  });
  it("text pod nadpisem max. 1 věta a 120 znaků", () => {
    for (const [k, v] of entries)
      if (k === "lead" || k.endsWith("_lead")) {
        expect(v.length, k).toBeLessThanOrEqual(120);
        expect(splitSentences(v).length, k).toBe(1);
      }
  });
  it("tlačítka max. 3 slova", () => {
    for (const [k, v] of entries) if (k.endsWith("_button")) expect(countWords(v), k).toBeLessThanOrEqual(3);
  });
  it("tykání: žádné vykání v textech", () => {
    const vykani = /\b(vás|vám|vaše|váš|vaši|odpovězte|vyberte|zkuste|můžete|změňte|posuňte)\b/i;
    for (const [k, v] of entries) expect(vykani.test(v), `${k}: ${v}`).toBe(false);
  });
});
