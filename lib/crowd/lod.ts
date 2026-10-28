/**
 * Úrovně detailu davu (SPEC-demonstrace §6.3) podle výšky postavy na obrazovce:
 * blízko = plná animace a čitelné cedule, středně = animace bez textu cedule,
 * daleko = statické siluety, celý dav = barevné tečky.
 */
export type Lod = "near" | "mid" | "far" | "dots";

/** Prahy ve px výšky postavy (100 jednotek světa × měřítko řady × zoom). */
export const LOD_PX = { near: 110, mid: 40, far: 12 } as const;

/** Výška postavy v px pro měřítko řady a zoom. */
export const figurePx = (scale: number, zoom: number) => 100 * scale * zoom;

export function lodFor(px: number): Lod {
  if (px >= LOD_PX.near) return "near";
  if (px >= LOD_PX.mid) return "mid";
  if (px >= LOD_PX.far) return "far";
  return "dots";
}

/** Strop animovaných postav najednou: 300 na mobilu, 1 500 na desktopu. */
export const ANIMATED_CAP = { mobile: 300, desktop: 1500 } as const;

export function animatedCap(mobile: boolean): number {
  return mobile ? ANIMATED_CAP.mobile : ANIMATED_CAP.desktop;
}

/** Hrubý odhad „mobilu“: malá obrazovka nebo dotyk bez myši. */
export function isMobileDevice(w: number, coarse: boolean): boolean {
  return w < 768 || coarse;
}

/**
 * Vybere nejvýš `cap` kandidátů nejblíž ke středu výřezu (cx, cy). Kandidát = [index, x, y].
 * O(n) průchod + částečné řazení; vrací množinu indexů.
 */
export function selectAnimated(cands: ReadonlyArray<readonly [number, number, number]>, cx: number, cy: number, cap: number): Set<number> {
  if (cands.length <= cap) return new Set(cands.map((c) => c[0]));
  const d = cands.map((c, k) => [(c[1] - cx) ** 2 + (c[2] - cy) ** 2, k] as const);
  d.sort((a, b) => a[0] - b[0]);
  const out = new Set<number>();
  for (let k = 0; k < cap; k++) out.add(cands[d[k]![1]]![0]);
  return out;
}
