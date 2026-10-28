import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { linksFileSchema, loadLinks } from "./links-schema";

/** /souvisejici: obsah je platný a iniciativy se odkazují jen z bloku postoje (SPEC §1). */
describe("content/links.yaml", () => {
  const l = loadLinks();

  it("má obě skupiny a iniciativa ruceprycodmedii.cz je od vlastníka", () => {
    expect(l.reading.items.length).toBeGreaterThan(0);
    const ruce = l.initiatives.items.find((i) => i.url === "https://ruceprycodmedii.cz/");
    expect(ruce?.added_by).toBe("owner");
  });

  it("odmítne iniciativu mezi zdroji k přečtení", () => {
    const bad = structuredClone(l);
    bad.reading.items[0] = { ...bad.reading.items[0]!, type: "iniciativa" };
    expect(linksFileSchema.safeParse(bad).success).toBe(false);
  });

  it("odmítne popis delší než 120 znaků a http adresu", () => {
    const bad = structuredClone(l);
    bad.reading.items[0] = { ...bad.reading.items[0]!, description: "x".repeat(121) };
    expect(linksFileSchema.safeParse(bad).success).toBe(false);
    const http = structuredClone(l);
    http.reading.items[0] = { ...http.reading.items[0]!, url: "http://example.cz/" };
    expect(linksFileSchema.safeParse(http).success).toBe(false);
  });

  it("kompas, vysvětlivky ani statistiky na iniciativy neodkazují", () => {
    const roots = ["app/kompas", "app/statistiky", "components/compass", "components/stats"].map((p) => path.join(process.cwd(), p));
    const files: string[] = [];
    const walk = (dir: string) => {
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p)) files.push(p);
      }
    };
    roots.forEach(walk);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/INITIATIVES_ANCHOR|#iniciativy|stance_link/);
    }
  });
});
