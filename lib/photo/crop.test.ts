import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import {
  clampCrop,
  coversFrame,
  displaySize,
  drawRect,
  fitWithin,
  initialCrop,
  keyAction,
  panBy,
  pinch,
  wheelZoom,
  zoomAt,
} from "./crop";

const landscape = { w: 4000, h: 3000 };
const portrait = { w: 3000, h: 4000 };

/** Pokrývá fotka celý čtverec 0..1? */
function covers(c: { zoom: number; ox: number; oy: number }, img: { w: number; h: number }) {
  const d = displaySize(img, c.zoom);
  return c.ox <= 1e-9 && c.oy <= 1e-9 && c.ox + d.w >= 1 - 1e-9 && c.oy + d.h >= 1 - 1e-9;
}

describe("ořez", () => {
  it("výchozí ořez pokryje čtverec a vystředí fotku", () => {
    const c = initialCrop(landscape);
    expect(c.zoom).toBe(1);
    expect(displaySize(landscape, 1)).toEqual({ w: 4000 / 3000, h: 1 });
    expect(c.ox).toBeCloseTo(-(4 / 3 - 1) / 2);
    expect(c.oy).toBe(0);
    expect(covers(c, landscape)).toBe(true);
    expect(initialCrop(portrait).ox).toBe(0);
  });

  it("posun se zastaví na okraji fotky", () => {
    const c = panBy(initialCrop(landscape), 5, 5, landscape);
    expect(c.ox).toBe(0);
    expect(c.oy).toBe(0);
    const d = panBy(initialCrop(landscape), -5, -5, landscape);
    expect(d.ox).toBeCloseTo(1 - 4 / 3);
    expect(covers(d, landscape)).toBe(true);
  });

  it("zoom drží bod pod prsty/kurzorem na místě", () => {
    const c0 = initialCrop(landscape);
    const anchor = { x: 0.5, y: 0.5 };
    const c1 = zoomAt(c0, 2, anchor, landscape);
    expect(c1.zoom).toBe(2);
    // bod fotky, který byl pod kotvou, je pod ní i po zoomu
    const before = (anchor.x - c0.ox) / c0.zoom;
    const after = (anchor.x - c1.ox) / c1.zoom;
    expect(after).toBeCloseTo(before);
    expect(covers(c1, landscape)).toBe(true);
  });

  it("zoom je omezený na MIN_ZOOM..MAX_ZOOM, při zoom ≥ 1 fotka pokryje čtverec", () => {
    const c = initialCrop(portrait);
    expect(zoomAt(c, 100, { x: 0, y: 0 }, portrait).zoom).toBe(MAX_ZOOM);
    const back = zoomAt(zoomAt(c, 3, { x: 1, y: 1 }, portrait), 1, { x: 0, y: 0 }, portrait);
    expect(back.zoom).toBe(1);
    expect(covers(back, portrait)).toBe(true);
    expect(zoomAt(c, 0.01, { x: 0, y: 0 }, portrait).zoom).toBe(MIN_ZOOM);
    expect(clampCrop({ zoom: NaN, ox: 0, oy: 0 }, portrait).zoom).toBe(1);
  });

  it("oddálení pod 100 %: fotka je menší než rámeček a celá v něm leží", () => {
    expect(MIN_ZOOM).toBeLessThanOrEqual(0.5);
    const sq = { w: 1000, h: 1000 };
    const c = zoomAt(initialCrop(sq), 0.5, { x: 0.5, y: 0.5 }, sq);
    expect(c).toEqual({ zoom: 0.5, ox: 0.25, oy: 0.25 }); // vystředěná
    expect(coversFrame(c, sq)).toBe(false);
    expect(coversFrame(initialCrop(sq), sq)).toBe(true);
    // posun: kamkoli uvnitř čtverce, ne přes okraj
    expect(panBy(c, 5, 5, sq)).toMatchObject({ ox: 0.5, oy: 0.5 });
    expect(panBy(c, -5, -5, sq)).toMatchObject({ ox: 0, oy: 0 });
    expect(panBy(c, 0.1, -0.1, sq)).toMatchObject({ ox: 0.35, oy: 0.15 });
  });

  it("oddálení u obdélníkové fotky: delší osa pokryje, kratší leží uvnitř", () => {
    // 4:3 při 0,9 → 1,2 × 0,9: vodorovně pokrývá, svisle je menší
    const c = clampCrop({ zoom: 0.9, ox: 0.3, oy: 0.3 }, landscape);
    expect(c.ox).toBeCloseTo(0); // větší než čtverec → nesmí odhalit levý okraj
    expect(c.oy).toBeCloseTo(0.1); // menší → nejvýš k dolnímu okraji
    const d = clampCrop({ zoom: 0.9, ox: -5, oy: -5 }, landscape);
    expect(d.ox).toBeCloseTo(1 - 1.2);
    expect(d.oy).toBe(0);
  });

  it("drawRect škáluje na velikost plátna", () => {
    const c = initialCrop(landscape);
    const r = drawRect(c, landscape, 1080);
    expect(r.h).toBeCloseTo(1080);
    expect(r.w).toBeCloseTo(1440);
    expect(r.x).toBeCloseTo(-180);
  });

  it("pinch a kolečko", () => {
    expect(pinch({ x: 0, y: 0 }, { x: 3, y: 4 })).toEqual({ dist: 5, mid: { x: 1.5, y: 2 } });
    expect(wheelZoom(2, -100)).toBeGreaterThan(2);
    expect(wheelZoom(2, 100)).toBeLessThan(2);
    expect(wheelZoom(1, 100)).toBeLessThan(1); // kolečko jde i pod 100 %
    expect(wheelZoom(1, 10000)).toBe(MIN_ZOOM);
  });

  it("fitWithin nikdy nezvětšuje a drží poměr", () => {
    expect(fitWithin({ w: 8000, h: 6000 }, 4096)).toEqual({ w: 4096, h: 3072 });
    expect(fitWithin({ w: 800, h: 600 }, 4096)).toEqual({ w: 800, h: 600 });
  });

  it("klávesnice", () => {
    expect(keyAction("ArrowLeft", false)).toEqual({ pan: { x: -0.02, y: 0 } });
    expect(keyAction("ArrowDown", true)).toEqual({ pan: { x: 0, y: 0.1 } });
    expect(keyAction("+", false)).toEqual({ zoom: 1.1 });
    expect(keyAction("0", false)).toEqual({ reset: true });
    expect(keyAction("a", false)).toBeNull();
  });
});
