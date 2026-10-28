import { describe, expect, it } from "vitest";
import { defaultPrefs, newSeed, parseStyle, sanitizePrefs, searchObce, writeStyle } from "./state";

describe("styl v URL", () => {
  it("parse s výchozími hodnotami", () => {
    expect(parseStyle(new URLSearchParams(""))).toEqual({ forma: 2, delka: 2, seed: null });
    expect(parseStyle(new URLSearchParams("f=3&d=1&s=abc123"))).toEqual({ forma: 3, delka: 1, seed: "abc123" });
    expect(parseStyle(new URLSearchParams("f=9&d=x&s=<script>"))).toEqual({ forma: 2, delka: 2, seed: null });
  });
  it("write zachová ostatní parametry", () => {
    const out = writeStyle(new URLSearchParams("sig=x"), { forma: 1, delka: 3, seed: "zz" });
    expect(out.toString()).toBe("sig=x&f=1&d=3&s=zz");
  });
  it("newSeed se liší od předchozího", () => {
    let i = 0;
    const seq = [0.5, 0.5, 0.25];
    const s1 = newSeed(undefined, () => seq[i++]!);
    const s2 = newSeed(s1, () => seq[i++]!);
    expect(s1).toMatch(/^[a-z0-9]{6}$/);
    expect(s2).not.toBe(s1);
  });
});

describe("uložené volby", () => {
  it("poškozená data → výchozí", () => {
    expect(sanitizePrefs("x")).toEqual(defaultPrefs());
    expect(sanitizePrefs({ kraj: "Praha", types: ["prezident", "hacker"], footer: false, custom: 5 })).toEqual({
      ...defaultPrefs(),
      types: ["prezident"],
      footer: false,
    });
  });
});

describe("hledání obce", () => {
  const list = [{ nazev: "Brno" }, { nazev: "Brodek u Konice" }, { nazev: "Velké Brno" }, { nazev: "Ústí nad Labem" }, { nazev: "Brníčko" }];
  it("bez diakritiky, začátek před obsahem", () => {
    expect(searchObce(list, "brn").map((o) => o.nazev)).toEqual(["Brno", "Brníčko", "Velké Brno"]);
    expect(searchObce(list, "usti").map((o) => o.nazev)).toEqual(["Ústí nad Labem"]);
    expect(searchObce(list, "  ")).toEqual([]);
  });
});
