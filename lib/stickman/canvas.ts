import { hasSign, type SignColor, type SignPaint } from "@/lib/demo/constants";
import { GLASSES_PATH, HAIR_PATHS, KEYS_RING_R, KEYS_SEGS, KEYS_STROKE, scarfShapes, STROKE, type Figure } from "./geometry";
import type { Hair } from "./params";
import type { StickmanPalette } from "./sign";

/**
 * Kreslení panáčka do Canvas 2D (atlas siluet a části postav pro PixiJS). Stejná geometrie
 * jako SVG. Paleta musí mít skutečné barvy (ne var(--…)) – v prohlížeči z getComputedStyle.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
}

/** Hlava se středem v (0,0) a poloměrem `r`; `stroke` = tloušťka čáry v px. */
export function drawHead(ctx: Ctx, hair: Hair, glasses: boolean, pal: StickmanPalette, r: number, stroke: number) {
  const k = r / 8;
  ctx.save();
  ctx.scale(k, k);
  ctx.lineWidth = stroke / k;
  ctx.strokeStyle = pal.ink;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fillStyle = pal.surface;
  ctx.fill();
  ctx.stroke();
  for (const part of HAIR_PATHS[hair]) {
    const p = new Path2D(part.d);
    if (part.fill) {
      ctx.fillStyle = pal.ink;
      ctx.fill(p);
    } else ctx.stroke(p);
  }
  if (glasses) {
    ctx.lineWidth = 1.5 / k;
    ctx.stroke(new Path2D(GLASSES_PATH));
  }
  ctx.restore();
}

/** Cedule se středem v (0,0). */
export function drawSign(ctx: Ctx, w: number, h: number, color: SignPaint, pal: StickmanPalette, stroke: number) {
  ctx.fillStyle = pal.signFill[color];
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = stroke;
  ctx.strokeStyle = pal.ink;
  ctx.lineJoin = "miter";
  ctx.strokeRect(-w / 2, -h / 2, w, h);
}

/** Šála se středem pruhu v (0,0). */
export function drawScarf(ctx: Ctx, sc: NonNullable<Figure["scarf"]>, scale: number, pal: StickmanPalette) {
  const s = scarfShapes(sc, scale);
  const cols = [pal.tricolor.white, pal.tricolor.red, pal.tricolor.blue];
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(s.band.x, s.band.y + (i * s.band.h) / 3, s.band.w, s.band.h / 3);
    ctx.fillRect(s.tail.x, s.tail.y + (i * s.tail.h) / 3, s.tail.w, s.tail.h / 3);
  });
  ctx.lineWidth = 1;
  ctx.strokeStyle = pal.ink;
  ctx.strokeRect(s.band.x, s.band.y, s.band.w, s.band.h);
  ctx.strokeRect(s.tail.x, s.tail.y, s.tail.w, s.tail.h);
}

/** Svazek klíčů s kroužkem v (0, 0), jednotky měřítka 1 (atlas i siluety). */
export function drawKeys(ctx: Ctx, pal: StickmanPalette) {
  ctx.save();
  ctx.lineCap = "square";
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = KEYS_STROKE;
  ctx.beginPath();
  ctx.arc(0, 0, KEYS_RING_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (const g of KEYS_SEGS) line(ctx, g.x1, g.y1, g.x2, g.y2);
  ctx.stroke();
  ctx.restore();
}

/** Celá postava bez textu cedule (statická silueta). Souřadnice postavy, chodidla na y = 0. */
export function drawFigure(ctx: Ctx, fig: Figure, signColor: SignColor, pal: StickmanPalette) {
  ctx.save();
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = STROKE;
  ctx.beginPath();
  for (const p of fig.poles) line(ctx, p.x1, p.y1, p.x2, p.y2);
  ctx.stroke();
  if (fig.sign && hasSign(signColor)) {
    ctx.save();
    ctx.translate(fig.sign.x, fig.sign.y);
    ctx.rotate((fig.sign.angle * Math.PI) / 180);
    drawSign(ctx, fig.sign.w, fig.sign.h, signColor, pal, STROKE);
    ctx.restore();
  }
  ctx.beginPath();
  for (const s of fig.body) line(ctx, s.x1, s.y1, s.x2, s.y2);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = STROKE;
  ctx.stroke();
  if (fig.fist) {
    ctx.fillStyle = pal.ink;
    ctx.fillRect(fig.fist.x - fig.fist.size / 2, fig.fist.y - fig.fist.size / 2, fig.fist.size, fig.fist.size);
  }
  if (fig.keys) {
    ctx.save();
    ctx.translate(fig.keys.x, fig.keys.y);
    ctx.rotate((fig.keys.angle * Math.PI) / 180);
    ctx.scale(fig.scale, fig.scale);
    drawKeys(ctx, pal);
    ctx.restore();
  }
  if (fig.scarf) {
    ctx.save();
    ctx.translate(fig.scarf.x, fig.scarf.y);
    ctx.rotate((fig.scarf.angle * Math.PI) / 180);
    drawScarf(ctx, fig.scarf, fig.scale, pal);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(fig.head.x, fig.head.y);
  ctx.rotate((fig.head.angle * Math.PI) / 180);
  drawHead(ctx, fig.hair, fig.glasses, pal, fig.head.r, STROKE);
  ctx.restore();
  ctx.restore();
}
