import { TILE_SIZE } from "@/lib/demo/constants";
import { indexRangesInRect, LAYOUT, positionFor, rowStart, type Rect } from "./layout";
import { LOD_PX } from "./lod";

/**
 * Dlaždice davu po 1 000 účastnících podle position_index (§6.4). Klient načítá jen dlaždice
 * ve výřezu a kolem něj, nejbližší ke středu napřed.
 */
export const tileOf = (index: number, tileSize = TILE_SIZE) => Math.floor(index / tileSize);

/** Dlaždice, které zasahují do výřezu (rozšířeného o `margin` jednotek), seřazené od středu výřezu. */
export function tilesForRect(rect: Rect, count: number, opts: { margin?: number; tileSize?: number; max?: number; origin?: number } = {}): number[] {
  const m = opts.margin ?? 0;
  const ts = opts.tileSize ?? TILE_SIZE;
  const origin = opts.origin ?? 0;
  const r = { x0: rect.x0 - m, y0: rect.y0 - m, x1: rect.x1 + m, y1: rect.y1 + m };
  const set = new Set<number>();
  for (const [i0, i1] of indexRangesInRect(r, count, origin)) {
    for (let t = tileOf(i0, ts); t <= tileOf(i1, ts); t++) set.add(t);
  }
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  // Vzdálenost dlaždice ke středu: podle prostřední osoby dlaždice (rychlý odhad).
  const dist = (t: number) => {
    const mid = Math.min(count - 1, t * ts + Math.floor(ts / 2));
    const p = positionFor(mid, origin);
    const first = positionFor(Math.max(origin, t * ts), origin);
    return Math.min((p.x - cx) ** 2 + (p.y - cy) ** 2, (first.x - cx) ** 2 + (first.y - cy) ** 2);
  };
  const out = [...set].sort((a, b) => dist(a) - dist(b) || a - b);
  return opts.max !== undefined ? out.slice(0, opts.max) : out;
}

/** První řada, jejíž postava je při zoomu `z` menší než `px` (hranice úrovně detailu). */
export function firstRowBelow(px: number, z: number): number {
  const sMin = px / (100 * z);
  return sMin >= 1 ? 0 : Math.max(0, Math.ceil(LAYOUT.perspectiveK * (1 / sMin - 1)));
}

export interface FetchPlan {
  /** Plné dlaždice (texty, jména, seed) – jen pro blízké a střední postavy (≥ LOD_PX.mid) ve výřezu. */
  full: number[];
  /** Přehledové dlaždice (1 B/osoba) – vzdálené siluety ve výřezu, které nepokryje plná dlaždice. */
  overview: number[];
  /** Indexy < fullFrom jsou blízko/středně; [fullFrom, dotsFrom) siluety; ≥ dotsFrom tečky (bez dat). */
  fullFrom: number;
  dotsFrom: number;
}

/**
 * Co stáhnout pro výřez (požadavek vlastníka na egress): tečky nic (pozice z rozvržení),
 * siluety jen přehled (~1 kB / 1 000 lidí), plné dlaždice jen pro postavy, u kterých jde číst
 * cedule a animují se. `count` = rozsah indexů (maxIndex + 1).
 */
export function fetchPlan(view: Rect, z: number, count: number, opts: { origin?: number; margin?: number; maxFull?: number; maxOverview?: number } = {}): FetchPlan {
  const origin = opts.origin ?? 0;
  const fullFrom = Math.min(count, origin + rowStart(firstRowBelow(LOD_PX.mid, z)));
  const dotsFrom = Math.min(count, origin + rowStart(firstRowBelow(LOD_PX.far, z)));
  const margin = opts.margin ?? 0;
  const full = fullFrom > origin ? tilesForRect(view, fullFrom, { margin, max: opts.maxFull, origin }) : [];
  const overview =
    dotsFrom > Math.max(fullFrom, origin)
      ? tilesForRect(view, dotsFrom, { margin, max: opts.maxOverview, origin }).filter((n) => !full.includes(n) && (n + 1) * TILE_SIZE > fullFrom)
      : [];
  return { full, overview, fullFrom, dotsFrom };
}

/** Celkový počet dlaždic pro `count` účastníků. */
export const tileCount = (count: number, tileSize = TILE_SIZE) => Math.ceil(Math.max(0, count) / tileSize);
