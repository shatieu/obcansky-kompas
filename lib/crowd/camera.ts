import { LAYOUT, positionFor, rowScale, rowY, STAGE, type Rect } from "./layout";

/**
 * Kamera davu: střed výřezu ve světě (x, y) a přiblížení z (px na jednotku světa).
 * URL drží pozici (?x=&y=&z=), aby šel sdílet konkrétní výřez (SPEC-demonstrace §6.2).
 */
export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Viewport {
  w: number;
  h: number;
}

export const ZOOM_MAX = 4;
export const ZOOM_MIN_FLOOR = 0.004;

/** Výřez světa viditelný kamerou. */
export function viewRect(c: Camera, v: Viewport, margin = 0): Rect {
  const hw = v.w / 2 / c.z + margin;
  const hh = v.h / 2 / c.z + margin;
  return { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh };
}

export const screenToWorld = (c: Camera, v: Viewport, sx: number, sy: number) => ({
  x: c.x + (sx - v.w / 2) / c.z,
  y: c.y + (sy - v.h / 2) / c.z,
});

export const worldToScreen = (c: Camera, v: Viewport, wx: number, wy: number) => ({
  x: (wx - c.x) * c.z + v.w / 2,
  y: (wy - c.y) * c.z + v.h / 2,
});

/** Přiblížení, při kterém se celé `bounds` vejde do výřezu. */
export function fitZoom(bounds: Rect, v: Viewport, pad = 0.92): number {
  const w = Math.max(1, bounds.x1 - bounds.x0);
  const h = Math.max(1, bounds.y1 - bounds.y0);
  return Math.max(ZOOM_MIN_FLOOR, Math.min(ZOOM_MAX, Math.min((v.w * pad) / w, (v.h * pad) / h)));
}

/** Omezí přiblížení a udrží střed v hranicích davu. */
export function clampCamera(c: Camera, bounds: Rect, v: Viewport): Camera {
  const zMin = Math.min(fitZoom(bounds, v, 0.8), 0.6);
  const z = Math.max(zMin, Math.min(ZOOM_MAX, c.z));
  const x = Math.max(bounds.x0, Math.min(bounds.x1, c.x));
  const y = Math.max(bounds.y0, Math.min(bounds.y1, c.y));
  return { x, y, z };
}

/** Zoom kolem bodu obrazovky (kolečko, pinch): bod pod prstem zůstane na místě. */
export function zoomAt(c: Camera, v: Viewport, sx: number, sy: number, factor: number): Camera {
  const before = screenToWorld(c, v, sx, sy);
  const z = Math.max(ZOOM_MIN_FLOOR, Math.min(ZOOM_MAX, c.z * factor));
  return { x: before.x - (sx - v.w / 2) / z, y: before.y - (sy - v.h / 2) / z, z };
}

/** Kamera zaměřená na postavu s daným indexem (postava ~ uprostřed výřezu). */
export function cameraOn(index: number, z: number, origin = 0): Camera {
  const p = positionFor(index, origin);
  return { x: p.x, y: p.y - 60 * p.scale, z: Math.max(z, 1.2 / p.scale) };
}

/** Výchozí přiblížení: mobil / desktop (cedule přední řady čitelné). */
export const START_ZOOM = { mobile: 1.15, desktop: 1.3 } as const;
/** Kolik řad (s celou postavou včetně cedule) má být nad pódiem vidět vždy. */
const START_ROWS = 3;
/** Okraj pod čelem pódia (jednotky světa). */
const START_STAGE_MARGIN = 8;

/**
 * Výchozí pohled (bez ?x=&y=&z=, bez /demonstrace/[id]): čelo pódia dole nad `insetBottom`
 * a nad ním přední řady – vždy aspoň START_ROWS celé řady (když je výřez nízký, kamera oddálí).
 * Rozvržení začíná indexem `origin` na místě 0 hned za pódiem, takže pohled nezávisí na
 * velikosti davu ani na minIndex (pro 1 i 100 000 lidí stejný).
 */
export function startCamera(v: Viewport, o: { mobile: boolean; insetBottom?: number; insetTop?: number }): Camera {
  const insetBottom = Math.max(0, o.insetBottom ?? 0);
  const insetTop = Math.max(0, o.insetTop ?? 0);
  const free = Math.max(120, v.h - insetBottom - insetTop);
  const r = START_ROWS - 1;
  const top = rowY(r) - LAYOUT.figureTop * rowScale(r);
  const need = STAGE.y1 + START_STAGE_MARGIN - top;
  const zMax = o.mobile ? START_ZOOM.mobile : START_ZOOM.desktop;
  const z = Math.max(0.35, Math.min(zMax, free / need));
  const y = STAGE.y1 + START_STAGE_MARGIN - (v.h / 2 - insetBottom) / z;
  return { x: 0, y, z };
}

const num = (v: string | null) => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Kamera z URL (?x=&y=&z=). Neplatné hodnoty = null. */
export function parseCamera(search: URLSearchParams | string): Camera | null {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const x = num(q.get("x"));
  const y = num(q.get("y"));
  const z = num(q.get("z"));
  if (x === null || y === null || z === null || z <= 0) return null;
  return { x, y, z: Math.max(ZOOM_MIN_FLOOR, Math.min(ZOOM_MAX, z)) };
}

/** Zaokrouhlené hodnoty do URL (stabilní při zpětném čtení). */
export function cameraParams(c: Camera): { x: string; y: string; z: string } {
  return { x: String(Math.round(c.x)), y: String(Math.round(c.y)), z: String(Math.round(c.z * 1000) / 1000) };
}

/** URL s kamerou; ostatní parametry zůstanou. */
export function withCamera(href: string, c: Camera): string {
  const u = new URL(href, "http://x");
  const p = cameraParams(c);
  u.searchParams.set("x", p.x);
  u.searchParams.set("y", p.y);
  u.searchParams.set("z", p.z);
  return href.startsWith("http") ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
}
