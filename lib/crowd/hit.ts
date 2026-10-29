import { hasSign, type Pose, type SignColor } from "@/lib/demo/constants";
import { figureGeometry, STROKE, type Figure } from "@/lib/stickman/geometry";
import type { StickmanParams } from "@/lib/stickman/params";
import { poseAt } from "@/lib/stickman/poses";
import type { Position, Rect } from "./layout";

/** Klepnutí vs. posun: pohyb nejvýš 8 px a nejdéle 300 ms; tolerance zásahu dotykem +8 px, myší +2 px. */
export const TAP = { movePx: 8, ms: 300, touchSlopPx: 8, mouseSlopPx: 2 } as const;

/** Je gesto klepnutí (výběr), ne posun? `dist` = největší vzdálenost od stisku (px), `ms` = délka. */
export const isTap = (dist: number, ms: number) => dist <= TAP.movePx && ms <= TAP.ms;

/** Nejmenší poloviční šířka těla pro zásah (jednotky × měřítko): panáček je jen pár čar. */
const BODY_MIN_HALF = 12;

/**
 * Zásahová plocha postavy ve světě z její geometrie (pro `hitTest`): tělo s hlavou, cedule
 * (obal natočeného obdélníku) a tyče. `t` = čas animace (animovaný rig), jinak klidová póza –
 * stejná jako statická silueta.
 */
export function figureHitRects(params: StickmanParams, pose: Pose, signColor: SignColor, pos: Position, t?: number): Rect[] {
  return figureRects(figureGeometry(params, poseAt(params, pose, t, hasSign(signColor))), pos);
}

/** Obdélníky postavy `fig` (souřadnice postavy, chodidla 0,0) umístěné na `pos`. */
export function figureRects(fig: Figure, pos: Position): Rect[] {
  const k = pos.scale;
  const W = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0: pos.x + x0 * k, y0: pos.y + y0 * k, x1: pos.x + x1 * k, y1: pos.y + y1 * k });
  const pad = STROKE;
  // Tělo + hlava
  let x0 = fig.head.x - fig.head.r;
  let x1 = fig.head.x + fig.head.r;
  let y0 = fig.head.y - fig.head.r;
  let y1 = 0;
  for (const g of fig.body) {
    x0 = Math.min(x0, g.x1, g.x2);
    x1 = Math.max(x1, g.x1, g.x2);
    y0 = Math.min(y0, g.y1, g.y2);
    y1 = Math.max(y1, g.y1, g.y2);
  }
  const cx = (x0 + x1) / 2;
  const half = Math.max(BODY_MIN_HALF * fig.scale, (x1 - x0) / 2 + pad);
  const out: Rect[] = [W(cx - half, y0 - pad, cx + half, y1 + pad)];
  // Cedule: obal natočeného obdélníku
  const sg = fig.sign;
  if (sg) {
    const a = (sg.angle * Math.PI) / 180;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const hw = (sg.w / 2) * c + (sg.h / 2) * s + pad;
    const hh = (sg.w / 2) * s + (sg.h / 2) * c + pad;
    out.push(W(sg.x - hw, sg.y - hh, sg.x + hw, sg.y + hh));
  }
  // Tyče
  for (const g of fig.poles) {
    out.push(W(Math.min(g.x1, g.x2) - pad, Math.min(g.y1, g.y2) - pad, Math.max(g.x1, g.x2) + pad, Math.max(g.y1, g.y2) + pad));
  }
  return out;
}
