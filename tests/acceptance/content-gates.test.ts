/**
 * SPEC §11 – brány obsahu:
 *  - `pnpm verify:content` selže, když se tvrzení změnilo po ověření (hash tvrzení v záznamu),
 *  - vysvětlivka bez kompletního ověření (poslední verdikt „ano“ u všech tvrzení + review
 *    nestrannosti i srozumitelnosti) se nezobrazí – místo ní „Vysvětlivka se připravuje“,
 *  - každý záznam ověření má pole human_reviewed.
 * Konvence záznamu: hash tvrzení je pole `claim_hash` = SHA-256 (hex) textu `claim`.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, copyContentToTemp, readYaml } from "./helpers/content";
import { runScript } from "./helpers/runtime";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
interface Claim {
  id: string;
  claim: string;
}
interface Expl {
  id: string;
  text: string;
  claims: Claim[];
}
type Rec = { claim_id: string; verdict: string; round?: number; claim_hash?: string; human_reviewed?: boolean };

function latest(dir: string, claimId: string): Rec | null {
  const f = path.join(dir, "verification", `${claimId}.json`);
  if (!existsSync(f)) return null;
  const raw = JSON.parse(readFileSync(f, "utf8")) as Rec | Rec[];
  const list = (Array.isArray(raw) ? raw : [raw]).sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  return list[list.length - 1] ?? null;
}
function reviewOk(dir: string, explId: string): boolean {
  const f = path.join(dir, "verification", "reviews", `${explId}.json`);
  if (!existsSync(f)) return false;
  const r = JSON.parse(readFileSync(f, "utf8")) as { impartiality?: string; clarity?: string };
  return r.impartiality === "ano" && r.clarity === "ano";
}
function completelyVerified(dir: string, e: Expl): boolean {
  return (
    reviewOk(dir, e.id) &&
    e.claims.every((c) => {
      const r = latest(dir, c.id);
      return r?.verdict === "ano" && r.claim_hash === sha(c.claim);
    })
  );
}
const explainerFiles = (dir: string) => readdirSync(path.join(dir, "explainers")).filter((f) => /^q[1-8](-opt\d+)?\.yaml$/.test(f));

/** Připraví v dočasné kopii obsahu plně ověřenou vysvětlivku q2-opt1. */
function prepareVerified() {
  const tmp = copyContentToTemp();
  const e = readYaml<Expl>("explainers/q2-opt1.yaml", tmp.content);
  for (const c of e.claims)
    writeFileSync(
      path.join(tmp.content, "verification", `${c.id}.json`),
      JSON.stringify({ claim_id: c.id, verdict: "ano", claim_hash: sha(c.claim), round: 1, human_reviewed: false, verifier: "test", checked_at: "2026-10-28T00:00:00Z" }),
    );
  writeFileSync(path.join(tmp.content, "verification", "reviews", "q2-opt1.json"), JSON.stringify({ impartiality: "ano", clarity: "ano" }));
  return { tmp, e };
}
const buildIn = (root: string) => runScript("scripts/content-build.ts", { cwd: root });
const generated = (contentDir: string) =>
  JSON.parse(readFileSync(path.join(contentDir, "generated", "explainers.json"), "utf8")) as Record<string, { status: string; text?: string }>;

describe("§11.3 verify:content", () => {
  it("projde na obsahu v repozitáři", () => {
    const r = runScript("scripts/verify-content.ts");
    expect(r.status, r.stderr || r.stdout).toBe(0);
  });

  it("selže, když se tvrzení změnilo po ověření (hash nesedí)", () => {
    const { tmp, e } = prepareVerified();
    expect(runScript("scripts/verify-content.ts", { cwd: tmp.root }).status).toBe(0);
    e.claims[0]!.claim = `${e.claims[0]!.claim} Navíc změněno.`;
    writeFileSync(path.join(tmp.content, "explainers", "q2-opt1.yaml"), stringify(e), "utf8");
    const r = runScript("scripts/verify-content.ts", { cwd: tmp.root });
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain(e.claims[0]!.id);
  });
});

describe("§11.3 vysvětlivka bez kompletního ověření se nezobrazí", () => {
  it("v repozitáři: zobrazené (verified) vysvětlivky jsou kompletně ověřené, ostatní jsou „připravuje se“ bez textu", () => {
    const gen = generated(CONTENT_DIR);
    for (const f of explainerFiles(CONTENT_DIR)) {
      const e = readYaml<Expl>(`explainers/${f}`);
      const entry = gen[e.id];
      expect(entry, e.id).toBeDefined();
      if (completelyVerified(CONTENT_DIR, e)) continue;
      expect(entry!.status, `${e.id} není kompletně ověřená, nesmí se zobrazit`).not.toBe("verified");
      expect(entry!.text).toBeUndefined();
    }
  });

  it("kompletně ověřená vysvětlivka se zobrazí", () => {
    const { tmp } = prepareVerified();
    const r = buildIn(tmp.root);
    expect(r.status, r.stderr).toBe(0);
    expect(generated(tmp.content)["q2-opt1"]!.status).toBe("verified");
  });

  it("poslední verdikt „ne“ u jednoho tvrzení → nezobrazí se", () => {
    const { tmp, e } = prepareVerified();
    const c = e.claims[0]!;
    writeFileSync(
      path.join(tmp.content, "verification", `${c.id}.json`),
      JSON.stringify([
        { claim_id: c.id, verdict: "ano", claim_hash: sha(c.claim), round: 1, human_reviewed: false },
        { claim_id: c.id, verdict: "ne", claim_hash: sha(c.claim), round: 2, human_reviewed: false },
      ]),
    );
    expect(buildIn(tmp.root).status).toBe(0);
    const entry = generated(tmp.content)["q2-opt1"]!;
    expect(entry.status).not.toBe("verified");
    expect(entry.text).toBeUndefined();
  });

  it("chybí review nestrannosti nebo srozumitelnosti → nezobrazí se", () => {
    const { tmp } = prepareVerified();
    writeFileSync(path.join(tmp.content, "verification", "reviews", "q2-opt1.json"), JSON.stringify({ impartiality: "ano", clarity: "ne" }));
    expect(buildIn(tmp.root).status).toBe(0);
    expect(generated(tmp.content)["q2-opt1"]!.status).not.toBe("verified");
  });

  it("chybí záznam ověření tvrzení → nezobrazí se", () => {
    const { tmp, e } = prepareVerified();
    rmSync(path.join(tmp.content, "verification", `${e.claims[0]!.id}.json`));
    expect(buildIn(tmp.root).status).toBe(0);
    expect(generated(tmp.content)["q2-opt1"]!.status).not.toBe("verified");
  });

  it("tvrzení změněné po ověření → build selže nebo se vysvětlivka nezobrazí", () => {
    const { tmp, e } = prepareVerified();
    e.claims[0]!.claim = `${e.claims[0]!.claim} Změna.`;
    writeFileSync(path.join(tmp.content, "explainers", "q2-opt1.yaml"), stringify(e), "utf8");
    const r = buildIn(tmp.root);
    if (r.status === 0) expect(generated(tmp.content)["q2-opt1"]!.status).not.toBe("verified");
  });

  it("text „Vysvětlivka se připravuje“ je v ui.yaml", () => {
    const ui = readFileSync(path.join(CONTENT_DIR, "ui.yaml"), "utf8");
    expect(ui).toMatch(/Vysvětlivka se připravuje/);
  });
});

describe("§11.1 / §11.3 formát záznamů ověření", () => {
  const files = readdirSync(path.join(CONTENT_DIR, "verification")).filter((f) => f.endsWith(".json"));
  it("existují záznamy ověření", () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(`${f}: má claim_id, verdict ano|ne|oprava, checked_at, verifier, round a human_reviewed`, () => {
      const raw = JSON.parse(readFileSync(path.join(CONTENT_DIR, "verification", f), "utf8")) as Rec | Rec[];
      for (const r of Array.isArray(raw) ? raw : [raw]) {
        expect(r.claim_id).toBe(f.replace(/\.json$/, ""));
        expect(["ano", "ne", "oprava"]).toContain(r.verdict);
        expect(r).toHaveProperty("checked_at");
        expect(r).toHaveProperty("verifier");
        expect(r).toHaveProperty("round");
        expect(typeof r.human_reviewed).toBe("boolean");
      }
    });
  }
  it("max. 2 kola ověření, pak needs_human (§11.2/3)", () => {
    for (const f of files) {
      const raw = JSON.parse(readFileSync(path.join(CONTENT_DIR, "verification", f), "utf8")) as Rec | Rec[];
      for (const r of Array.isArray(raw) ? raw : [raw]) expect(r.round ?? 1, f).toBeLessThanOrEqual(2);
    }
  });
});
