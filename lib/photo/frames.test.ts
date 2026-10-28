import { describe, expect, it } from "vitest";
import { FRAME_R } from "./constants";
import {
  CORNER,
  RING,
  applyDuotone,
  arcAngle,
  arcLayout,
  chordWidth,
  duotoneLayout,
  fitArcFontSize,
  flagGeometry,
  rectInsideCircle,
  ribbonLayout,
  splitBalanced,
  wrapWords,
  type Measure,
} from "./frames";

/** Náhrada měření: široké písmo ≈ 0,8 em na znak (Mona Sans Expanded 800 je takto široké). */
const wide: Measure = (text, fs) => Array.from(text).length * fs * 0.8;

const SLOGANS = ["RUCE PRYČ OD MÉDIÍ", "MÉDIA NEDÁME", "MÉDIA VEŘEJNÉ SLUŽBY MI NEJSOU JEDNO"];

describe("kruhový pruh – slogan po oblouku", () => {
  it("znaky leží na kružnici, vystředěné nahoře, zleva doprava", () => {
    const glyphs = arcLayout("ABC", { fontSize: 60, measure: wide, letterSpacing: 0 });
    for (const g of glyphs) expect(Math.hypot(g.x - FRAME_R, g.y - FRAME_R)).toBeCloseTo(RING.textRadius);
    expect(glyphs[1]!.x).toBeCloseTo(FRAME_R); // prostřední znak nahoře uprostřed
    expect(glyphs[1]!.y).toBeCloseTo(FRAME_R - RING.textRadius);
    expect(glyphs[1]!.rotation).toBeCloseTo(0);
    expect(glyphs[0]!.x).toBeLessThan(glyphs[2]!.x);
    expect(glyphs[0]!.rotation).toBeLessThan(0);
    expect(glyphs[0]!.rotation).toBeCloseTo(-glyphs[2]!.rotation);
  });

  it("všechny slogany se vejdou do horního oblouku", () => {
    for (const s of SLOGANS) {
      const fs = fitArcFontSize(s, RING.textRadius, RING.maxTextAngle, wide);
      expect(fs).toBeGreaterThanOrEqual(RING.minFontSize);
      expect(arcAngle(s, fs, RING.textRadius, wide, RING.letterSpacing)).toBeLessThanOrEqual(RING.maxTextAngle);
      const g = arcLayout(s, { fontSize: fs, measure: wide });
      expect(g.every((x) => x.y < FRAME_R)).toBe(true); // jen horní půlka (modrá)
    }
    expect(fitArcFontSize("MÉDIA NEDÁME", RING.textRadius, RING.maxTextAngle, wide)).toBe(RING.preferredFontSize);
  });
});

describe("stuha", () => {
  it("krátký slogan na jeden řádek, dlouhý na dva, vše uvnitř kruhu", () => {
    expect(ribbonLayout("MÉDIA NEDÁME", wide).lines).toEqual(["MÉDIA NEDÁME"]);
    const long = ribbonLayout(SLOGANS[2]!, wide);
    expect(long.lines.length).toBe(2);
    for (const s of SLOGANS) {
      const l = ribbonLayout(s, wide);
      l.lines.forEach((line, i) => {
        expect(wide(line, l.fontSize)).toBeLessThanOrEqual(chordWidth(l.ys[i]! + l.fontSize * 0.4));
        expect(l.ys[i]! - l.fontSize / 2).toBeGreaterThanOrEqual(700);
        expect(l.ys[i]! + l.fontSize / 2).toBeLessThanOrEqual(870);
      });
    }
  });
  it("vyvážené rozdělení", () => {
    expect(splitBalanced("MÉDIA VEŘEJNÉ SLUŽBY MI NEJSOU JEDNO")).toEqual(["MÉDIA VEŘEJNÉ SLUŽBY", "MI NEJSOU JEDNO"]);
    expect(splitBalanced("JEDNO")).toEqual(["JEDNO", ""]);
  });
});

describe("vlajka v rohu", () => {
  it("vždy 3 : 2, klín do poloviny délky, ochranný prostor ≥ ¼ výšky, celá v kruhu", () => {
    const g = flagGeometry(CORNER.x, CORNER.y, CORNER.w);
    const h = g.white.h + g.red.h;
    expect(CORNER.w / h).toBeCloseTo(3 / 2);
    expect(g.white.h).toBe(g.red.h);
    expect(g.wedge[1]).toEqual([CORNER.x + CORNER.w / 2, CORNER.y + h / 2]);
    expect(CORNER.x - g.plate.x).toBeGreaterThanOrEqual(h / 4);
    expect(g.plate.y + g.plate.h - (CORNER.y + h)).toBeGreaterThanOrEqual(h / 4);
    expect(rectInsideCircle(g.plate.x, g.plate.y, g.plate.w, g.plate.h)).toBe(true);
  });
});

describe("duotón", () => {
  it("zalomení po slovech jako v návrhu", () => {
    expect(wrapWords("Ruce pryč od médií", 10)).toEqual(["Ruce pryč", "od médií"]);
    expect(wrapWords("Média veřejné služby mi nejsou jedno", 10)).toEqual(["Média", "veřejné", "služby mi", "nejsou", "jedno"]);
  });

  it("text a linka se vejdou do kruhu, linka pod textem", () => {
    for (const s of SLOGANS) {
      const l = duotoneLayout(s, wide);
      l.lines.forEach((line, i) => {
        const y = l.ys[i]!;
        expect(wide(line, l.fontSize)).toBeLessThanOrEqual(Math.min(chordWidth(y - l.fontSize * 0.4), chordWidth(y + l.fontSize * 0.4)));
      });
      expect(l.bar.y).toBeGreaterThan(l.ys[l.ys.length - 1]!);
      expect(rectInsideCircle(l.bar.x, l.bar.y, l.bar.w, l.bar.h)).toBe(true);
    }
  });

  it("černá → modrá vlajky, bílá zůstane bílá, alfa beze změny", () => {
    const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 128]);
    applyDuotone(px);
    expect(Array.from(px)).toEqual([0x11, 0x45, 0x7e, 255, 255, 255, 255, 128]);
  });
});
