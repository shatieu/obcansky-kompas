import { describe, expect, it } from "vitest";
import { HEAD_LIMITS } from "@/lib/stickman/geometry";
import { POSES, SIGN_COLORS, type TileItem } from "@/lib/demo/constants";
import { decodeCell, encodeCell, encodeOverview } from "@/lib/demo/overview";
import { generateStickman, SIGN_SHAPES } from "@/lib/stickman/params";
import { hash32, mulberry32 } from "@/lib/stickman/prng";
import { cameraParams, clampCamera, fitZoom, parseCamera, screenToWorld, startCamera, viewRect, withCamera, worldToScreen, zoomAt } from "./camera";
import { figureHitRects, isTap, TAP } from "./hit";
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
  STAGE,
} from "./layout";
import { ANIMATED_CAP, animatedCap, figurePx, LOD_PX, lodFor, selectAnimated } from "./lod";
import { fetchPlan, tileCount, tileOf, tilesForRect } from "./tiles";

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
    expect(hitTest(positionFor(3).x, positionFor(3).y - 60, count, { exists: (k) => k !== 3 })).not.toBe(3);
  });
});

describe("počátek rozvržení (minIndex)", () => {
  const origin = 500;
  it("první obsazený index stojí vepředu uprostřed hned za pódiem", () => {
    for (const k of [0, 1, 2, 11, 12, 777]) {
      const a = positionFor(origin + k, origin);
      const b = positionFor(k);
      expect(a.row).toBe(b.row);
      expect(a.scale).toBe(b.scale);
      expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(2 * LAYOUT.jitterX);
      expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(2 * LAYOUT.jitterY);
    }
    expect(positionFor(origin, origin).row).toBe(0);
    // index pod počátkem nespadne (stojí na místě 0)
    expect(positionFor(3, origin).row).toBe(0);
  });

  it("výřez, rozsahy, dlaždice a hranice počítají s počátkem", () => {
    const count = origin + 3000;
    const r = { x0: -300, y0: -600, x1: 300, y1: 100 };
    const got = new Set<number>();
    forEachInRect(r, count, (i) => got.add(i), origin);
    expect(got.size).toBeGreaterThan(20);
    for (const i of got) expect(i).toBeGreaterThanOrEqual(origin);
    for (let i = origin; i < count; i++) {
      const p = positionFor(i, origin);
      const s = p.scale;
      if (p.x + LAYOUT.figureHalfW * s >= r.x0 && p.x - LAYOUT.figureHalfW * s <= r.x1 && p.y >= r.y0 && p.y - LAYOUT.figureTop * s <= r.y1) expect(got).toContain(i);
    }
    const ranges = indexRangesInRect(r, count, origin);
    for (const i of got) expect(ranges.some(([a, b]) => i >= a && i <= b)).toBe(true);
    expect(tilesForRect(r, count, { origin })).toEqual([0]);
    expect(crowdBounds(count, origin)).toEqual(crowdBounds(3000));
  });
});

describe("výchozí kamera (startCamera)", () => {
  const engineBounds = (count: number, origin: number) => {
    const b = crowdBounds(Math.max(origin + 1, count), origin);
    return { x0: Math.min(b.x0, STAGE.x0), x1: Math.max(b.x1, STAGE.x1), y0: b.y0, y1: STAGE.y1 + 40 };
  };
  const views = [
    { w: 360, h: 500, mobile: true },
    { w: 360, h: 420, mobile: true },
    { w: 412, h: 640, mobile: true },
    { w: 1280, h: 620, mobile: false },
    { w: 1280, h: 800, mobile: false },
    { w: 800, h: 560, mobile: false },
  ];
  /** Podíl obdélníku postavy (s cedulí) uvnitř výřezu. */
  const inside = (i: number, origin: number, v: { x0: number; y0: number; x1: number; y1: number }) => {
    const p = positionFor(i, origin);
    const f = { x0: p.x - 30 * p.scale, x1: p.x + 30 * p.scale, y0: p.y - LAYOUT.figureTop * p.scale, y1: p.y };
    const w = Math.max(0, Math.min(f.x1, v.x1) - Math.max(f.x0, v.x0));
    const h = Math.max(0, Math.min(f.y1, v.y1) - Math.max(f.y0, v.y0));
    return (w * h) / ((f.x1 - f.x0) * (f.y1 - f.y0));
  };

  it("na začátku jsou vidět lidé přední řady a pódium dole – pro malý i velký dav a minIndex > 0", () => {
    for (const vw of views) {
      for (const origin of [0, 500, 12_345]) {
        for (const n of [1, 3, 5, 20, 502, 100_000]) {
          const count = origin + n;
          const vp = { w: vw.w, h: vw.h };
          const cam = clampCamera(startCamera(vp, { mobile: vw.mobile }), engineBounds(count, origin), vp);
          const view = viewRect(cam, vp);
          const first = Math.min(n, 11);
          const shares = Array.from({ length: first }, (_, k) => inside(origin + k, origin, view));
          const ctx = `${vw.w}×${vw.h} origin ${origin} n ${n}`;
          // první člověk (vepředu uprostřed) celý
          expect(shares[0], ctx).toBeGreaterThanOrEqual(0.95);
          // aspoň 3 (nebo všichni) z první řady skoro celí, a většina první řady ve výřezu
          expect(shares.filter((s) => s >= 0.9).length, ctx).toBeGreaterThanOrEqual(Math.min(first, 3));
          expect(shares.reduce((a, b) => a + b, 0) / first, ctx).toBeGreaterThanOrEqual(0.5);
          // pódium dole: hrana podlahy ve výřezu, pod čelem jen malý okraj
          expect(STAGE.y0, ctx).toBeLessThan(view.y1);
          expect(view.y1 - STAGE.y1, ctx).toBeLessThan(0.1 * (view.y1 - view.y0));
          // nad pódiem jsou vidět aspoň 3 řady
          if (n >= 40) expect(rowY(2), ctx).toBeGreaterThan(view.y0);
          // postavy čitelné (ne tečky)
          expect(figurePx(1, cam.z), ctx).toBeGreaterThanOrEqual(LOD_PX.near * 0.7);
        }
      }
    }
  });
});

describe("hitTest s cedulí a tyčemi", () => {
  const count = 400;
  const people = new Map<number, { params: ReturnType<typeof generateStickman>; pose: (typeof POSES)[number]; color: "white" | "blue" | "red" | "none" }>();
  const colors = ["white", "blue", "red", "none"] as const;
  for (let i = 0; i < count; i++) people.set(i, { params: generateStickman(hash32(i + 77)), pose: POSES[i % POSES.length]!, color: colors[i % 4]! });
  const shape = (i: number, pos: ReturnType<typeof positionFor>) => {
    const q = people.get(i)!;
    return figureHitRects(q.params, q.pose, q.color, pos);
  };
  const within = (b: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number, m = 0) => x >= b.x0 - m && x <= b.x1 + m && y >= b.y0 - m && y <= b.y1 + m;
  /** Referenční pravidlo hrubou silou: přesný zásah před tolerancí, pak `top`, pak přední (větší y). */
  const brute = (x: number, y: number, slop: number, top: number | null = null) => {
    let ex: number | null = null;
    let nr: number | null = null;
    const pick = (cur: number | null, i: number) => (cur === null || (cur !== top && (i === top || positionFor(i).y > positionFor(cur).y)) ? i : cur);
    for (let i = 0; i < count; i++) {
      const rs = shape(i, positionFor(i));
      if (rs.some((b) => within(b, x, y))) ex = pick(ex, i);
      else if (slop > 0 && rs.some((b) => within(b, x, y, slop))) nr = pick(nr, i);
    }
    return ex ?? nr;
  };

  it("klepnutí na ceduli vybere toho, kdo ji drží", () => {
    let tested = 0;
    for (let i = 0; i < 60; i++) {
      const q = people.get(i)!;
      if (q.color === "none") continue;
      const rs = shape(i, positionFor(i));
      expect(rs.length).toBeGreaterThanOrEqual(2);
      const sign = rs[1]!;
      // horní třetina cedule (nad hlavou, kam tělo nesahá)
      const x = (sign.x0 + sign.x1) / 2;
      const y = sign.y0 + (sign.y1 - sign.y0) * 0.2;
      // jen když tam nezasahuje nikdo přednější (jinak platí pořadí kreslení – testuje se níž)
      if (brute(x, y, 0) !== i) continue;
      expect(hitTest(x, y, count, { shape })).toBe(i);
      // bez plochy cedule (jen tělo) by se netrefil
      expect(hitTest(x, y, count)).not.toBe(i);
      tested++;
    }
    expect(tested).toBeGreaterThan(15);
  });

  it("překryv: vyhrává přední postava, zvýrazněná (top) vždy; přesný zásah před tolerancí", () => {
    // bod v ceduli zadní postavy a zároveň v těle přední
    let found = false;
    for (let b = 11; b < 200 && !found; b++) {
      if (people.get(b)!.color === "none") continue;
      const sign = shape(b, positionFor(b))[1]!;
      for (let f = 0; f < 11 && !found; f++) {
        if (positionFor(f).y <= positionFor(b).y) continue;
        const body = shape(f, positionFor(f))[0]!;
        const x0 = Math.max(sign.x0, body.x0);
        const x1 = Math.min(sign.x1, body.x1);
        const y0 = Math.max(sign.y0, body.y0);
        const y1 = Math.min(sign.y1, body.y1);
        if (x0 >= x1 || y0 >= y1) continue;
        const x = (x0 + x1) / 2;
        const y = (y0 + y1) / 2;
        const front = brute(x, y, 0);
        expect(hitTest(x, y, count, { shape })).toBe(front);
        expect(positionFor(front!).y).toBeGreaterThanOrEqual(positionFor(f).y);
        expect(hitTest(x, y, count, { shape, top: b })).toBe(b);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("dotyková tolerance: těsně vedle postavy trefí, daleko ne", () => {
    const one = 1; // jediná postava (index 0)
    const rs = shape(0, positionFor(0));
    const body = rs[0]!;
    const x = body.x1 + 5;
    const y = (body.y0 + body.y1) / 2;
    if (!rs.some((b) => within(b, x, y))) {
      expect(hitTest(x, y, one, { shape })).toBeNull();
      expect(hitTest(x, y, one, { shape, slop: 8 })).toBe(0);
    }
    expect(hitTest(body.x1 + 40, y, one, { shape, slop: 8 })).toBeNull();
  });

  it("shoduje se s referenčním pravidlem na náhodných bodech (s tolerancí i bez)", () => {
    const rnd = mulberry32(42);
    for (let k = 0; k < 1500; k++) {
      const x = -420 + rnd() * 840;
      const y = -900 + rnd() * 960;
      const slop = k % 3 === 0 ? 0 : 6;
      const top = k % 5 === 0 ? Math.floor(rnd() * 100) : null;
      expect(hitTest(x, y, count, { shape, slop, top })).toBe(brute(x, y, slop, top));
    }
  });

  it("chybějící postava se netrefí", () => {
    const p = positionFor(0);
    expect(hitTest(p.x, p.y - 50, count, { shape, exists: (k) => k !== 0 })).not.toBe(0);
  });

  it("klepnutí vs. posun: ≤ 8 px a ≤ 300 ms", () => {
    expect(isTap(0, 120)).toBe(true);
    expect(isTap(8, 300)).toBe(true);
    expect(isTap(9, 100)).toBe(false);
    expect(isTap(2, 301)).toBe(false);
    expect(TAP.touchSlopPx).toBe(8);
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
    const p = personFromItem([5, 123, "pest", "red", "p:ruce-pryc", null, "2026-10-28"]);
    expect(p).toMatchObject({ index: 5, pose: "pest", signColor: "red", name: null });
    const presets = { "ruce-pryc": "Ruce pryč od médií", "nejsou-jedno": "X" };
    expect(sloganText(p.slogan, presets, "nejsou-jedno")).toBe("Ruce pryč od médií");
    expect(sloganText("t:Vlastní", presets, "nejsou-jedno")).toBe("Vlastní");
    expect(sloganText("p:neexistuje", presets, "nejsou-jedno")).toBe("X");
    // neplatná póza/barva → bezpečné výchozí
    const bad = personFromItem([1, 1, "xx" as never, "green" as never, "", null, ""]);
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

describe("přehledové dlaždice a stahování podle LOD (egress)", () => {
  it("bajt přehledu: kódování ↔ dekódování pro všechny pózy, barvy a tvary", () => {
    for (const pose of POSES)
      for (const c of SIGN_COLORS)
        for (const sh of SIGN_SHAPES) {
          const b = encodeCell(pose, c, sh);
          expect(b).toBeGreaterThanOrEqual(0x80);
          expect(b).toBeLessThan(256);
          expect(decodeCell(b)).toEqual({ pose, signColor: c, signShape: sh });
        }
    expect(decodeCell(0)).toBeNull();
  });

  it("encodeOverview: 1 B na index, mezery 0, tvar cedule ze seedu", () => {
    const items: TileItem[] = [
      [1000, 42, "mava", "blue", "p:x", null, "a", "2026-10-28"],
      [1003, 7, "klice", "none", "", "Eva", "b", "2026-10-28"],
    ];
    const b = encodeOverview(1, items);
    expect(b.length).toBe(4);
    expect(decodeCell(b[0]!)).toEqual({ pose: "mava", signColor: "blue", signShape: generateStickman(42).signShape });
    expect(b[1]).toBe(0);
    expect(b[2]).toBe(0);
    expect(decodeCell(b[3]!)).toMatchObject({ pose: "klice", signColor: "none" });
    const full = Array.from({ length: 1000 }, (_, k): TileItem => [k, k, "drzi", "white", "", null, String(k), ""]);
    expect(encodeOverview(0, full).length).toBe(1000);
  });

  it("ukázkový zdroj: přehled odpovídá plným dlaždicím, personAt dá id", async () => {
    const src = fixtureSource(1500, ["a"], []);
    const ov = await src.overview(1);
    const t = await src.tile(1);
    expect(ov.length).toBe(500);
    for (const p of t) expect(decodeCell(ov[p.index - 1000]!)).toMatchObject({ pose: p.pose, signColor: p.signColor });
    expect((await src.personAt(1234))!.id).toBe("fixture-1234");
    expect(await src.personAt(5000)).toBeNull();
  });

  it("tečky: nic se nestahuje (celý dav, 100 000 lidí)", () => {
    const count = 100_000;
    const v = { w: 1280, h: 800 };
    const b = crowdBounds(count);
    const z = fitZoom(b, v);
    const plan = fetchPlan(viewRect({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z }, v), z, count, { margin: 500 });
    expect(plan.dotsFrom).toBe(0);
    expect(plan.full).toEqual([]);
    expect(plan.overview).toEqual([]);
  });

  it("výchozí pohled: jen plné dlaždice přední části, přehled nic navíc", () => {
    for (const origin of [0, 500]) {
      const count = origin + 50_000;
      const v = { w: 360, h: 500 };
      const cam = startCamera(v, { mobile: true });
      const plan = fetchPlan(viewRect(cam, v), cam.z, count, { origin, margin: 100 });
      expect(plan.full).toEqual([0]);
      expect(plan.overview).toEqual([]);
    }
  });

  it("siluety: přehled místo plných dlaždic, plné jen pro blízké/střední postavy", () => {
    const count = 50_000;
    const v = { w: 1280, h: 800 };
    // oddáleno tak, že přední řady jsou střední a zadní siluety
    for (const z of [0.6, 0.35, 0.2, 0.12]) {
      const cam = { x: 0, y: rowY(60), z };
      const view = viewRect(cam, v);
      const plan = fetchPlan(view, z, count, { margin: 0 });
      // plné dlaždice jen s indexy < fullFrom
      for (const n of plan.full) expect(n * 1000).toBeLessThan(plan.fullFrom);
      // přehled jen pro dlaždice se siluetami (≥ fullFrom) a ne zároveň plné
      for (const n of plan.overview) {
        expect((n + 1) * 1000).toBeGreaterThan(plan.fullFrom);
        expect(plan.full).not.toContain(n);
      }
      // každá silueta ve výřezu je pokrytá plnou nebo přehledovou dlaždicí
      forEachInRect(view, plan.dotsFrom, (i) => {
        if (i < plan.fullFrom) return;
        expect(plan.full.includes(tileOf(i)) || plan.overview.includes(tileOf(i))).toBe(true);
      });
      // postavy pod LOD_PX.mid nejsou v plných dlaždicích kvůli sobě
      expect(figurePx(rowScale(rowOf(Math.max(0, plan.fullFrom))), z)).toBeLessThan(LOD_PX.mid + 1);
    }
  });
});
