import { describe, expect, it } from "vitest";
import { MAX_ZOOM } from "./constants";
import {
  clampCrop,
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

  it("zoom je omezený na 1..MAX_ZOOM a fotka vždy pokryje čtverec", () => {
    const c = initialCrop(portrait);
    expect(zoomAt(c, 100, { x: 0, y: 0 }, portrait).zoom).toBe(MAX_ZOOM);
    const out = zoomAt(zoomAt(c, 3, { x: 1, y: 1 }, portrait), 0.1, { x: 0, y: 0 }, portrait);
    expect(out.zoom).toBe(1);
    expect(covers(out, portrait)).toBe(true);
    expect(clampCrop({ zoom: NaN, ox: 0, oy: 0 }, portrait).zoom).toBe(1);
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
    expect(wheelZoom(1, 1000)).toBe(1);
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
