/**
 * Limity textu SPEC §4.1 pro content/ui-fotka.yaml (pnpm lint:content ho zatím nečte,
 * dokud se nesloučí do ui.yaml).
 */
import { describe, expect, it } from "vitest";
import { loadPhotoUi } from "./content";

const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
const sentences = (s: string) => s.split(/[.!?…](\s|$)/).filter((x) => x && x.trim()).length;

describe("ui-fotka.yaml", () => {
  const ui = loadPhotoUi();
  const entries = Object.entries(ui).filter((e): e is [string, string] => typeof e[1] === "string");

  it("nadpisy max. 8 slov", () => {
    for (const [k, v] of entries) if (k === "title" || k.endsWith("_title")) expect(words(v), k).toBeLessThanOrEqual(8);
  });
  it("text pod nadpisem max. 1 věta a 120 znaků", () => {
    for (const [k, v] of entries)
      if (k === "lead" || k.endsWith("_lead")) {
        expect(v.length, k).toBeLessThanOrEqual(120);
        expect(sentences(v), k).toBe(1);
      }
  });
  it("tlačítka max. 3 slova", () => {
    for (const [k, v] of entries) if (k.endsWith("_button")) expect(words(v), k).toBeLessThanOrEqual(3);
  });
  it("žádná loga ani zmínky ČT/ČRo v textech fotky", () => {
    expect(JSON.stringify(ui)).not.toMatch(/ČT|ČRo|Česká televize|Český rozhlas/);
  });
});
