import { hash32 } from "@/lib/stickman/prng";

/**
 * Rozvržení davu (SPEC-demonstrace §6.1). Čisté funkce nad `position_index`:
 * první lidé vepředu uprostřed, dav roste dozadu a do stran po řadách (každá řada o 2 delší),
 * řada se plní od středu střídavě doleva a doprava. Jednoduchá perspektiva: zadní řady menší a výš.
 * Souřadnice světa: chodidla panáčka, osa y dolů, řada 0 na y = 0, pódium před ní (y > 0).
 */
export const LAYOUT = {
  /** Lidí v první řadě (liché = jeden přesně uprostřed). */
  firstRow: 11,
  /** O kolik je každá další řada delší. */
  growth: 2,
  /** Rozestup v řadě při měřítku 1 (jednotky světa; postava ~100). */
  spacingX: 40,
  /** Svislý rozestup řad při měřítku 1 – hlava zadní řady je vždy nad hlavou přední. */
  rowSpacing: 62,
  /** Perspektiva: měřítko řady r = 1 / (1 + r / K). */
  perspectiveK: 80,
  /** Náhodný posun ze seedu (± jednotky × měřítko). */
  jitterX: 4,
  jitterY: 3,
  /** Rozměry postavy pro ořez a zásahy (× měřítko): nad chodidly, do stran. */
  figureTop: 195,
  figureHalfW: 92,
} as const;

export interface Position {
  x: number;
  y: number;
  scale: number;
  row: number;
}

/** Index prvního člověka v řadě r (součet délek předchozích řad). */
export const rowStart = (r: number) => r * LAYOUT.firstRow + (LAYOUT.growth * r * (r - 1)) / 2;
/** Počet míst v řadě r. */
export const rowLength = (r: number) => LAYOUT.firstRow + LAYOUT.growth * r;
/** Měřítko řady r. */
export const rowScale = (r: number) => 1 / (1 + r / LAYOUT.perspectiveK);

/** Řada, do které patří index (O(1) přes kvadratickou rovnici). */
export function rowOf(index: number): number {
  const a = LAYOUT.growth / 2;
  const b = LAYOUT.firstRow - a;
  let r = Math.floor((-b + Math.sqrt(b * b + 4 * a * index)) / (2 * a));
  while (r > 0 && rowStart(r) > index) r--;
  while (rowStart(r + 1) <= index) r++;
  return r;
}

let ys = new Float64Array(0);
let ysLen = 0;
/** y chodidel řady r (bez posunu). Kumulativní součet, memoizovaný – stále čistá funkce. */
export function rowY(r: number): number {
  if (r < ysLen) return ys[r]!;
  if (r >= ys.length) {
    const next = new Float64Array(Math.max(1024, ys.length * 2, r + 1));
    next.set(ys.subarray(0, ysLen));
    ys = next;
  }
  if (ysLen === 0) {
    ys[0] = 0;
    ysLen = 1;
  }
  for (let i = ysLen; i <= r; i++) ys[i] = ys[i - 1]! - LAYOUT.rowSpacing * rowScale(i);
  ysLen = r + 1;
  return ys[r]!;
}

/** Pořadí v řadě → posun od středu ve sloupcích: 0, −1, +1, −2, +2 … */
export const slotOffset = (j: number) => (j === 0 ? 0 : j % 2 === 1 ? -(j + 1) / 2 : j / 2);
/** Opak slotOffset. */
export const offsetSlot = (o: number) => (o === 0 ? 0 : o < 0 ? -2 * o - 1 : 2 * o);

function jitter(index: number) {
  const h = hash32(index);
  return { jx: ((h & 0xffff) / 0xffff) * 2 - 1, jy: (((h >>> 16) & 0xffff) / 0xffff) * 2 - 1 };
}

/** Pozice podle pořadí připojení. Čistá, stabilní, unikátní. */
export function positionFor(index: number): Position {
  const row = rowOf(index);
  const j = index - rowStart(row);
  const scale = rowScale(row);
  const { jx, jy } = jitter(index);
  return {
    x: (slotOffset(j) * LAYOUT.spacingX + jx * LAYOUT.jitterX) * scale,
    y: rowY(row) + jy * LAYOUT.jitterY * scale,
    scale,
    row,
  };
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Řady, jejichž postavy (chodidla rowY, vršek rowY − figureTop·s) zasahují do svislého rozsahu [y0, y1].
 * Obě hranice jsou monotónní v r, takže stačí dvě binární hledání.
 */
export function rowsInRange(y0: number, y1: number, maxRow: number): [number, number] | null {
  const j = LAYOUT.jitterY;
  // první řada, jejíž vršek je nad spodním okrajem: rowY − top·s ≤ y1 + j
  let lo = 0;
  let hi = maxRow + 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (rowY(m) - LAYOUT.figureTop * rowScale(m) <= y1 + j) hi = m;
    else lo = m + 1;
  }
  const first = lo;
  // poslední řada, jejíž chodidla jsou pod horním okrajem: rowY ≥ y0 − j
  lo = 0;
  hi = maxRow + 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (rowY(m) >= y0 - j) lo = m + 1;
    else hi = m;
  }
  const last = lo - 1;
  if (first > maxRow || last < first) return null;
  return [first, last];
}

/** Rozsah posunů (sloupců) řady r, které zasahují do [x0, x1]. */
export function offsetsInRange(r: number, x0: number, x1: number): [number, number] | null {
  const s = rowScale(r);
  const step = LAYOUT.spacingX * s;
  const pad = (LAYOUT.figureHalfW + LAYOUT.jitterX) * s;
  const half = (rowLength(r) - 1) / 2;
  const a = Math.max(-half, Math.ceil((x0 - pad) / step));
  const b = Math.min(half, Math.floor((x1 + pad) / step));
  return a > b ? null : [a, b];
}

/** Projde indexy (< count) ve výřezu světa. Pořadí: zadní řady dřív (pro kreslení podle hloubky). */
export function forEachInRect(rect: Rect, count: number, cb: (index: number, row: number) => void): void {
  if (count <= 0) return;
  const maxRow = rowOf(count - 1);
  const rows = rowsInRange(rect.y0, rect.y1, maxRow);
  if (!rows) return;
  for (let r = rows[1]; r >= rows[0]; r--) {
    const offs = offsetsInRange(r, rect.x0, rect.x1);
    if (!offs) continue;
    const start = rowStart(r);
    for (let o = offs[0]; o <= offs[1]; o++) {
      const i = start + offsetSlot(o);
      if (i < count) cb(i, r);
    }
  }
}

/** Rozsah indexů každé řady ve výřezu (nadmnožina) – pro výpočet dlaždic bez procházení lidí. */
export function indexRangesInRect(rect: Rect, count: number): [number, number][] {
  const out: [number, number][] = [];
  if (count <= 0) return out;
  const maxRow = rowOf(count - 1);
  const rows = rowsInRange(rect.y0, rect.y1, maxRow);
  if (!rows) return out;
  for (let r = rows[0]; r <= rows[1]; r++) {
    const offs = offsetsInRange(r, rect.x0, rect.x1);
    if (!offs) continue;
    const [a, b] = offs;
    let j0: number;
    let j1: number;
    if (a <= 0 && b >= 0) {
      j0 = 0;
      j1 = Math.max(offsetSlot(b), offsetSlot(a));
    } else if (a > 0) {
      j0 = offsetSlot(a);
      j1 = offsetSlot(b);
    } else {
      j0 = offsetSlot(b);
      j1 = offsetSlot(a);
    }
    const start = rowStart(r);
    const i0 = start + j0;
    const i1 = Math.min(count - 1, start + j1);
    if (i0 <= i1) out.push([i0, i1]);
  }
  return out;
}

/** Hranice davu s `count` lidmi (bez pódia). */
export function crowdBounds(count: number): Rect {
  const n = Math.max(1, count);
  const maxRow = rowOf(n - 1);
  let halfW = 0;
  // Nejširší je poslední plná řada (perspektiva šířku řad zmenšuje jen pomalu).
  for (const r of [maxRow, Math.max(0, maxRow - 1)]) {
    const used = r === maxRow ? n - rowStart(r) : rowLength(r);
    const maxOff = Math.ceil(used / 2);
    halfW = Math.max(halfW, (maxOff * LAYOUT.spacingX + LAYOUT.figureHalfW) * rowScale(r));
  }
  halfW = Math.max(halfW, ((LAYOUT.firstRow / 2) * LAYOUT.spacingX + LAYOUT.figureHalfW));
  return { x0: -halfW, x1: halfW, y0: rowY(maxRow) - LAYOUT.figureTop * rowScale(maxRow), y1: STAGE.y1 };
}

/** Pódium před první řadou (§6.1): nízké, s celou vlajkou 3 : 2 na čelní straně. */
export const STAGE = {
  x0: -280,
  x1: 280,
  /** Horní hrana (podlaha pódia) a spodek čela. */
  y0: 24,
  y1: 90,
  /** Hloubka podlahy pódia nad čelem. */
  top: 12,
  /** Vlajka na čele: výška; šířka = 3/2 výšky; volný prostor ≥ 1/4 výšky. */
  flagH: 36,
} as const;

/**
 * Zásah klepnutím: kdo stojí v bodě světa (wx, wy)? Vrací přední (nejníž stojící) postavu,
 * jejíž tělo (bez cedule) bod obsahuje, nebo null.
 */
export function hitTest(wx: number, wy: number, count: number, exists?: (index: number) => boolean): number | null {
  if (count <= 0) return null;
  const maxRow = rowOf(count - 1);
  const rows = rowsInRange(wy - 4, wy + 4, maxRow);
  if (!rows) return null;
  let best: number | null = null;
  let bestY = -Infinity;
  for (let r = rows[0]; r <= rows[1]; r++) {
    const s = rowScale(r);
    const o0 = Math.round(wx / (LAYOUT.spacingX * s));
    const start = rowStart(r);
    const half = (rowLength(r) - 1) / 2;
    for (let o = o0 - 1; o <= o0 + 1; o++) {
      if (o < -half || o > half) continue;
      const i = start + offsetSlot(o);
      if (i >= count || (exists && !exists(i))) continue;
      const p = positionFor(i);
      if (Math.abs(wx - p.x) <= 17 * s && wy <= p.y + 4 * s && wy >= p.y - 108 * s && p.y > bestY) {
        best = i;
        bestY = p.y;
      }
    }
  }
  return best;
}

/** Nejbližší postava k bodu (střed postavy), v okolí `radius` jednotek. Pro klávesnici (Enter). */
export function nearestIndex(wx: number, wy: number, count: number, radius: number, exists?: (index: number) => boolean): number | null {
  let best: number | null = null;
  let bestD = radius * radius;
  forEachInRect({ x0: wx - radius, y0: wy - radius, x1: wx + radius, y1: wy + radius }, count, (i) => {
    if (exists && !exists(i)) return;
    const p = positionFor(i);
    const dx = p.x - wx;
    const dy = p.y - 50 * p.scale - wy;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
