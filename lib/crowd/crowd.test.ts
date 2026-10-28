import { describe, expect, it } from "vitest";
import { HEAD_LIMITS } from "@/lib/stickman/geometry";
import { cameraParams, clampCamera, parseCamera, screenToWorld, viewRect, withCamera, worldToScreen, zoomAt } from "./camera";
import { fixtureSource, personFromItem, sloganText } from "./data";
import { czPlural, formatCount, formatDay, formatRank } from "./format";
import {
  crowdBounds,
  forEachInRect,
  hitTest,
  indexRangesInRect,
  LAYOUT,
  offsetSlot,
  positionFor,
  rowLength,
  rowOf,
  rowScale,
  rowStart,
  rowY,
  slotOffset,
} from "./layout";
import { ANIMATED_CAP, animatedCap, figurePx, LOD_PX, lodFor, selectAnimated } from "./lod";
import { tileCount, tileOf, tilesForRect } from "./tiles";

const N = 100_000;

describe("positionFor", () => {
  it("řady a sloty sedí (rowOf, rowStart, slotOffset)", () => {
    for (let r = 0; r < 400; r++) {
      expect(rowOf(rowStart(r))).toBe(r);
      expect(rowOf(rowStart(r) + rowLength(r) - 1)).toBe(r);
      expect(rowStart(r + 1) - rowStart(r)).toBe(rowLength(r));
    }
    for (let j = 0; j < 1000; j++) expect(offsetSlot(slotOffset(j))).toBe(j);
  });

  it("první lidé stojí vepředu uprostřed, dav roste dozadu a do stran", () => {
    const p0 = positionFor(0);
    expect(p0.row).toBe(0);
    expect(Math.abs(p0.x)).toBeLessThanOrEqual(LAYOUT.jitterX);
    expect(positionFor(1).x).toBeLessThan(0);
    expect(positionFor(2).x).toBeGreaterThan(0);
    const back = positionFor(5000);
    expect(back.y).toBeLessThan(p0.y);
    expect(back.scale).toBeLessThan(p0.scale);
    // zadní řady jsou výš a menší (monotónně)
    for (let r = 1; r < 300; r++) {
      expect(rowY(r)).toBeLessThan(rowY(r - 1));
      expect(rowScale(r)).toBeLessThan(rowScale(r - 1));
    }
  });

  it("je stabilní a unikátní pro prvních 100 000 indexů", () => {
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const a = positionFor(i);
      const key = `${a.x.toFixed(4)}|${a.y.toFixed(4)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(positionFor(12345)).toEqual(positionFor(12345));
    expect(positionFor(99_999)).toMatchInlineSnapshot(`
      {
        "row": 311,
        "scale": 0.20460358056265984,
        "x": 790.0944892491215,
        "y": -9110.319099427632,
      }
    `);
  });

  it("hlavy se nepřekrývají pro prvních 100 000 indexů (nejhorší výška, velikost hlavy i posun)", () => {
    // Hlava = svislá úsečka možných středů [y − max·s, y − min·s] s poloměrem rMax·s.
    const xs = new Float64Array(N);
    const top = new Float64Array(N);
    const bot = new Float64Array(N);
    const rad = new Float64Array(N);
    const CELL = 64;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < N; i++) {
      const p = positionFor(i);
      xs[i] = p.x;
      top[i] = p.y - HEAD_LIMITS.centerMax * p.scale;
      bot[i] = p.y - HEAD_LIMITS.centerMin * p.scale;
      rad[i] = HEAD_LIMITS.rMax * p.scale;
      const key = `${Math.floor(p.x / CELL)}|${Math.floor((top[i]! + bot[i]!) / 2 / CELL)}`;
      const b = grid.get(key);
      if (b) b.push(i);
      else grid.set(key, [i]);
    }
    let checked = 0;
    for (const [key, list] of grid) {
      const [cx, cy] = key.split("|").map(Number) as [number, number];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const other = grid.get(`${cx + dx}|${cy + dy}`);
          if (!other) continue;
          for (const a of list)
            for (const b of other) {
              if (b <= a) continue;
              checked++;
              const gap = Math.max(0, Math.max(top[a]!, top[b]!) - Math.min(bot[a]!, bot[b]!));
              const d = Math.hypot(xs[a]! - xs[b]!, gap);
              if (d < rad[a]! + rad[b]!) throw new Error(`překryv hlav ${a} × ${b}: ${d} < ${rad[a]! + rad[b]!}`);
            }
        }
    }
    expect(checked).toBeGreaterThan(N);
  });
});

describe("výřez a dlaždice", () => {
  const count = 5000;
  const brute = (r: { x0: number; y0: number; x1: number; y1: number }) => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const p = positionFor(i);
      const s = p.scale;
      if (p.x + LAYOUT.figureHalfW * s >= r.x0 && p.x - LAYOUT.figureHalfW * s <= r.x1 && p.y >= r.y0 && p.y - LAYOUT.figureTop * s <= r.y1) out.push(i);
    }
    return out;
  };
  const rects = [
    { x0: -300, y0: -400, x1: 300, y1: 100 },
    { x0: 200, y0: -1500, x1: 900, y1: -900 },
    { x0: -2000, y0: -3000, x1: -1200, y1: -2500 },
    { x0: -50, y0: -60, x1: 50, y1: -20 },
  ];

  it("forEachInRect najde všechny postavy zasahující do výřezu (zezadu dopředu)", () => {
    for (const r of rects) {
      const got: number[] = [];
      const rows: number[] = [];
      forEachInRect(r, count, (i, row) => {
        got.push(i);
        rows.push(row);
      });
      for (const i of brute(r)) expect(got).toContain(i);
      for (let k = 1; k < rows.length; k++) expect(rows[k]!).toBeLessThanOrEqual(rows[k - 1]!);
    }
  });

  it("rozsahy indexů a dlaždice pokryjí výřez", () => {
    for (const r of rects) {
      const ranges = indexRangesInRect(r, count);
      const tiles = tilesForRect(r, count, { tileSize: 1000 });
      forEachInRect(r, count, (i) => {
        expect(ranges.some(([a, b]) => i >= a && i <= b)).toBe(true);
        expect(tiles).toContain(tileOf(i, 1000));
      });
    }
    expect(tilesForRect({ x0: -100, y0: -200, x1: 100, y1: 50 }, count)).toEqual([0]);
    expect(tilesForRect({ x0: -100, y0: -200, x1: 100, y1: 50 }, 0)).toEqual([]);
    expect(tileCount(1000)).toBe(1);
    expect(tileCount(1001)).toBe(2);
    expect(tilesForRect(crowdBounds(count), count, { max: 3 }).length).toBe(3);
  });

  it("dlaždice seřazené od středu výřezu", () => {
    const tiles = tilesForRect(crowdBounds(count), count);
    expect(tiles.length).toBe(5);
    const view = { x0: -200, y0: -2600, x1: 200, y1: -2200 };
    const near = tilesForRect(view, count, { margin: 2000 });
    expect(near[0]).toBe(tileOf(forEachFirst(view, count), 1000));
  });

  it("hitTest najde postavu pod prstem, mimo dav nic", () => {
    for (const i of [0, 7, 123, 4321]) {
      const p = positionFor(i);
      expect(hitTest(p.x, p.y - 60 * p.scale, count)).toBe(i);
    }
    expect(hitTest(5000, 5000, count)).toBeNull();
    expect(hitTest(positionFor(3).x, positionFor(3).y - 60, count, (k) => k !== 3)).not.toBe(3);
  });
});

function forEachFirst(r: { x0: number; y0: number; x1: number; y1: number }, count: number) {
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  let best = 0;
  let d = Infinity;
  forEachInRect(r, count, (i) => {
    const p = positionFor(i);
    const dd = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (dd < d) {
      d = dd;
      best = i;
    }
  });
  return best;
}

describe("LOD", () => {
  it("úrovně podle výšky postavy na obrazovce", () => {
    expect(lodFor(LOD_PX.near)).toBe("near");
    expect(lodFor(LOD_PX.near - 1)).toBe("mid");
    expect(lodFor(LOD_PX.mid)).toBe("mid");
    expect(lodFor(LOD_PX.mid - 1)).toBe("far");
    expect(lodFor(LOD_PX.far)).toBe("far");
    expect(lodFor(LOD_PX.far - 0.1)).toBe("dots");
    expect(figurePx(0.5, 2)).toBe(100);
  });

  it("strop animovaných: 300 mobil, 1 500 desktop, nejblíž ke středu", () => {
    expect(animatedCap(true)).toBe(ANIMATED_CAP.mobile);
    expect(animatedCap(false)).toBe(ANIMATED_CAP.desktop);
    const cands = Array.from({ length: 5000 }, (_, i) => [i, (i % 100) * 10, Math.floor(i / 100) * 10] as const);
    const sel = selectAnimated(cands, 500, 250, 300);
    expect(sel.size).toBe(300);
    expect(sel.has(25 * 100 + 50)).toBe(true);
    expect(sel.has(0)).toBe(false);
    expect(selectAnimated(cands.slice(0, 10), 0, 0, 300).size).toBe(10);
  });
});

describe("kamera", () => {
  it("URL tam a zpět", () => {
    const c = { x: -123.4, y: -4567.8, z: 0.75321 };
    const p = parseCamera(new URLSearchParams(cameraParams(c)));
    expect(p).toEqual({ x: -123, y: -4568, z: 0.753 });
    expect(parseCamera(new URLSearchParams(cameraParams(p!)))).toEqual(p);
    expect(parseCamera("?x=1&y=2")).toBeNull();
    expect(parseCamera("?x=a&y=2&z=1")).toBeNull();
    expect(parseCamera("?x=1&y=2&z=-1")).toBeNull();
    expect(withCamera("/demonstrace/abc?debug=1", { x: 1, y: 2, z: 1.5 })).toBe("/demonstrace/abc?debug=1&x=1&y=2&z=1.5");
  });

  it("přepočet obrazovka ↔ svět a zoom kolem bodu", () => {
    const v = { w: 800, h: 600 };
    const c = { x: 10, y: -50, z: 2 };
    const w = screenToWorld(c, v, 123, 456);
    const s = worldToScreen(c, v, w.x, w.y);
    expect(s.x).toBeCloseTo(123);
    expect(s.y).toBeCloseTo(456);
    const z = zoomAt(c, v, 123, 456, 1.5);
    const w2 = screenToWorld(z, v, 123, 456);
    expect(w2.x).toBeCloseTo(w.x);
    expect(w2.y).toBeCloseTo(w.y);
    const r = viewRect(c, v);
    expect(r.x1 - r.x0).toBe(400);
    const cl = clampCamera({ x: 1e9, y: 1e9, z: 100 }, crowdBounds(500), v);
    expect(cl.z).toBeLessThanOrEqual(4);
    expect(cl.x).toBeLessThanOrEqual(crowdBounds(500).x1);
  });
});

describe("data a formát", () => {
  it("pořadí, počet a datum česky", () => {
    expect(formatRank(2480, "{rank}. účastník")).toBe("2 481. účastník");
    expect(formatCount(1234567)).toBe("1 234 567");
    expect(czPlural(1, "a", "b", "c")).toBe("a");
    expect(czPlural(3, "a", "b", "c")).toBe("b");
    expect(czPlural(0, "a", "b", "c")).toBe("c");
    expect(czPlural(12, "a", "b", "c")).toBe("c");
    expect(formatDay("2026-10-08")).toBe("8. 10. 2026");
  });

  it("položka dlaždice → osoba, slogan z předvolby nebo vlastní", () => {
    const p = personFromItem([5, 123, "pest", "red", "p:ruce-pryc", null, "uuid", "2026-10-28"]);
    expect(p).toMatchObject({ index: 5, pose: "pest", signColor: "red", name: null });
    const presets = { "ruce-pryc": "Ruce pryč od médií", "nejsou-jedno": "X" };
    expect(sloganText(p.slogan, presets, "nejsou-jedno")).toBe("Ruce pryč od médií");
    expect(sloganText("t:Vlastní", presets, "nejsou-jedno")).toBe("Vlastní");
    expect(sloganText("p:neexistuje", presets, "nejsou-jedno")).toBe("X");
    // neplatná póza/barva → bezpečné výchozí
    const bad = personFromItem([1, 1, "xx" as never, "green" as never, "", null, "i", ""]);
    expect(bad.pose).toBe("drzi");
    expect(bad.signColor).toBe("white");
  });

  it("ukázková data jsou deterministická a sedí s dlaždicemi", async () => {
    const src = fixtureSource(2500, ["a", "b"], ["Vlastní"]);
    const meta = await src.meta();
    expect(meta).toMatchObject({ count: 2500, tiles: 3 });
    const t2 = await src.tile(2);
    expect(t2.length).toBe(500);
    expect(t2[0]!.index).toBe(2000);
    expect(await src.tile(0)).toEqual(await src.tile(0));
    expect((await src.person("fixture-7"))!.index).toBe(7);
    expect(await src.person("fixture-9999")).toBeNull();
  });
});
