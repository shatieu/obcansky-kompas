import { describe, expect, it } from "vitest";
import { generateStickman } from "@/lib/stickman";
import { HERO_CROWD_SEEDS, HERO_CROWD_SIZE, heroCrowdSvg } from "./hero-crowd";

describe("ilustrace demonstrace v hero", () => {
  const svg = heroCrowdSvg();

  it("je deterministická (pevné seedy, stejný obrázek při každém požadavku)", () => {
    expect(heroCrowdSvg()).toBe(svg);
  });

  it("malá skupinka 7–12 postav", () => {
    expect(HERO_CROWD_SIZE).toBeGreaterThanOrEqual(7);
    expect(HERO_CROWD_SIZE).toBeLessThanOrEqual(12);
    expect(svg.match(/<circle r="8"/g)).toHaveLength(HERO_CROWD_SIZE);
  });

  it("cedule bez textu a bez červené (červená patří vlajce)", () => {
    expect(svg).not.toMatch(/<text|<tspan/);
    expect(svg).not.toMatch(/--red|--flag-red|#D7141A/i);
    expect(svg).toMatch(/var\(--blue\)/);
  });

  it("žádná šála v trikolóře", () => {
    for (const s of HERO_CROWD_SEEDS) expect(generateStickman(s).scarf).toBe(false);
  });
});
