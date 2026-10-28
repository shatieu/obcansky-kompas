import { TILE_SIZE } from "@/lib/demo/constants";
import { indexRangesInRect, positionFor, type Rect } from "./layout";

/**
 * Dlaždice davu po 1 000 účastnících podle position_index (§6.4). Klient načítá jen dlaždice
 * ve výřezu a kolem něj, nejbližší ke středu napřed.
 */
export const tileOf = (index: number, tileSize = TILE_SIZE) => Math.floor(index / tileSize);

/** Dlaždice, které zasahují do výřezu (rozšířeného o `margin` jednotek), seřazené od středu výřezu. */
export function tilesForRect(rect: Rect, count: number, opts: { margin?: number; tileSize?: number; max?: number } = {}): number[] {
  const m = opts.margin ?? 0;
  const ts = opts.tileSize ?? TILE_SIZE;
  const r = { x0: rect.x0 - m, y0: rect.y0 - m, x1: rect.x1 + m, y1: rect.y1 + m };
  const set = new Set<number>();
  for (const [i0, i1] of indexRangesInRect(r, count)) {
    for (let t = tileOf(i0, ts); t <= tileOf(i1, ts); t++) set.add(t);
  }
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  // Vzdálenost dlaždice ke středu: podle prostřední osoby dlaždice (rychlý odhad).
  const dist = (t: number) => {
    const mid = Math.min(count - 1, t * ts + Math.floor(ts / 2));
    const p = positionFor(mid);
    const first = positionFor(t * ts);
    return Math.min((p.x - cx) ** 2 + (p.y - cy) ** 2, (first.x - cx) ** 2 + (first.y - cy) ** 2);
  };
  const out = [...set].sort((a, b) => dist(a) - dist(b) || a - b);
  return opts.max !== undefined ? out.slice(0, opts.max) : out;
}

/** Celkový počet dlaždic pro `count` účastníků. */
export const tileCount = (count: number, tileSize = TILE_SIZE) => Math.ceil(Math.max(0, count) / tileSize);
