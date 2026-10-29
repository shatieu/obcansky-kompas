import { generateStickman, SIGN_SHAPES, type SignShape } from "@/lib/stickman/params";
import { POSES, SIGN_COLORS, TILE_SIZE, type Pose, type SignColor, type TileItem } from "./constants";

/**
 * Přehledová dlaždice davu (GET /api/demonstrace/overview/[n]): 1 bajt na position_index
 * n·1000 … n·1000 + délka − 1, jen to, co je vidět na úrovni siluet a teček:
 *   bit 7     obsazeno (0 = mezera / mimo dav → celý bajt 0)
 *   bity 4–6  póza (index v POSES, 0–6)
 *   bity 2–3  barva cedule (index v SIGN_COLORS, 0–3)
 *   bity 0–1  tvar cedule (index v SIGN_SHAPES, 0–2; ze seedu)
 * Bez textu a jmen – skrytí ani úprava textu ji nemění. Čisté, i v prohlížeči.
 */
export interface OverviewCell {
  pose: Pose;
  signColor: SignColor;
  signShape: SignShape;
}

export const OVERVIEW_PRESENT = 0x80;

export function encodeCell(pose: Pose, signColor: SignColor, signShape: SignShape): number {
  const p = Math.max(0, POSES.indexOf(pose));
  const c = Math.max(0, SIGN_COLORS.indexOf(signColor));
  const s = Math.max(0, SIGN_SHAPES.indexOf(signShape));
  return OVERVIEW_PRESENT | (p << 4) | (c << 2) | s;
}

/** Bajt → vzhled; null = mezera. Neznámé hodnoty (novější server) spadnou na první položku. */
export function decodeCell(b: number): OverviewCell | null {
  if (!(b & OVERVIEW_PRESENT)) return null;
  return {
    pose: POSES[(b >> 4) & 7] ?? POSES[0],
    signColor: SIGN_COLORS[(b >> 2) & 3] ?? SIGN_COLORS[0],
    signShape: SIGN_SHAPES[b & 3] ?? SIGN_SHAPES[0],
  };
}

/**
 * Bajty dlaždice `n` z položek plné dlaždice (serverová data cache – DB se nečte znovu).
 * Délka = do posledního obsazeného indexu (plná dlaždice 1 000).
 */
export function encodeOverview(n: number, items: readonly TileItem[]): Uint8Array {
  const base = n * TILE_SIZE;
  let len = 0;
  for (const it of items) len = Math.max(len, it[0] - base + 1);
  const out = new Uint8Array(Math.max(0, Math.min(TILE_SIZE, len)));
  for (const it of items) {
    const k = it[0] - base;
    if (k < 0 || k >= out.length) continue;
    out[k] = encodeCell(it[2], it[3], generateStickman(Number(it[1]) >>> 0).signShape);
  }
  return out;
}
