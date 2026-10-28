import { POSES, SIGN_COLORS, type Pose, type SignColor } from "@/lib/demo/constants";
import { drawFigure, drawHead, drawScarf, drawSign } from "@/lib/stickman/canvas";
import { figureGeometry, SIGN_SIZE, STROKE, VIEWBOX } from "@/lib/stickman/geometry";
import { HAIR_STYLES, SIGN_SHAPES, type Hair, type SignShape, type StickmanParams } from "@/lib/stickman/params";
import { poseAt } from "@/lib/stickman/poses";
import type { StickmanPalette } from "@/lib/stickman/sign";

/**
 * Atlas textur davu v jednom canvasu (jeden zdroj textury = dávkování v PixiJS):
 * siluety (póza × barva × tvar cedule) pro dálku, hlavy s vlasy, cedule, šála, vlajka, bílý čtverec.
 * Kreslí se z barev aktuálního motivu; při změně motivu se překreslí.
 */
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Kotva v px uvnitř rámce (bod, který odpovídá počátku kreslení). */
  ax: number;
  ay: number;
}

/** px na jednotku světa v atlasu pro části postav. */
export const PART_RES = 4;
/** px na jednotku světa pro siluety. */
export const SIL_RES = 0.8;

export const ATLAS_W = 2048;
export const ATLAS_H = 1600;

export interface AtlasLayout {
  silhouette: Map<string, Frame>;
  placeholder: Frame;
  head: Map<string, Frame>;
  sign: Map<string, Frame>;
  scarf: Frame;
  flag: Frame;
  white: Frame;
}

export const silKey = (pose: Pose, color: SignColor, shape: SignShape) => `${pose}|${color}|${shape}`;
export const headKey = (hair: Hair, glasses: boolean) => `${hair}|${glasses ? 1 : 0}`;
export const signKey = (shape: SignShape, color: SignColor) => `${shape}|${color}`;

/** Průměrný panáček pro siluety (výška 1). */
const CANON: StickmanParams = {
  seed: 0,
  height: 1,
  headSize: 1,
  armLength: 1,
  legLength: 1,
  shoulderWidth: 1,
  lean: 0,
  headTilt: 0,
  hair: "short",
  glasses: false,
  scarf: false,
  signShape: "rect",
  speed: 1,
  phase: 0,
};

/** Rozvržení rámců (nezávislé na barvách). */
export function atlasLayout(): AtlasLayout {
  const silhouette = new Map<string, Frame>();
  const cw = Math.ceil(VIEWBOX.w * SIL_RES) + 4;
  const ch = Math.ceil(VIEWBOX.h * SIL_RES) + 4;
  let k = 0;
  const cols = Math.floor(ATLAS_W / cw);
  const cell = () => {
    const f = { x: (k % cols) * cw, y: Math.floor(k / cols) * ch, w: cw, h: ch, ax: 2 - VIEWBOX.x * SIL_RES, ay: 2 - VIEWBOX.y * SIL_RES };
    k++;
    return f;
  };
  for (const pose of POSES) for (const color of SIGN_COLORS) for (const shape of SIGN_SHAPES) silhouette.set(silKey(pose, color, shape), cell());
  const placeholder = cell();
  let y = Math.ceil(k / cols) * ch + 2;

  // Hlavy: souřadnice hlavy (poloměr 8) x −17…17, y −16…13.
  const head = new Map<string, Frame>();
  const hw = 36 * PART_RES;
  const hh = 31 * PART_RES;
  let x = 0;
  for (const hair of HAIR_STYLES)
    for (const g of [false, true]) {
      if (x + hw > ATLAS_W) {
        x = 0;
        y += hh;
      }
      head.set(headKey(hair, g), { x, y, w: hw, h: hh, ax: 18 * PART_RES, ay: 17 * PART_RES });
      x += hw;
    }
  y += hh;
  x = 0;
  const sign = new Map<string, Frame>();
  let rowH = 0;
  for (const shape of SIGN_SHAPES)
    for (const color of SIGN_COLORS) {
      const s = SIGN_SIZE[shape];
      const w = Math.ceil((s.w + STROKE + 2) * PART_RES);
      const h = Math.ceil((s.h + STROKE + 2) * PART_RES);
      if (x + w > ATLAS_W) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      sign.set(signKey(shape, color), { x, y, w, h, ax: w / 2, ay: h / 2 });
      x += w;
      rowH = Math.max(rowH, h);
    }
  y += rowH;
  x = 0;
  const scarf: Frame = { x, y, w: 24 * PART_RES, h: 24 * PART_RES, ax: 12 * PART_RES, ay: 6 * PART_RES };
  x += scarf.w;
  // Vlajka 3:2 (900×600 → 66×44 jednotek) s 1jednotkovým obrysem.
  const flag: Frame = { x, y, w: 70 * PART_RES, h: 48 * PART_RES, ax: 35 * PART_RES, ay: 24 * PART_RES };
  x += flag.w;
  const white: Frame = { x: x + 4, y: y + 4, w: 8, h: 8, ax: 4, ay: 4 };
  if (y + Math.max(scarf.h, flag.h) > ATLAS_H) throw new Error("atlas: málo místa");
  return { silhouette, placeholder, head, sign, scarf, flag, white };
}

/** Nakreslí celý atlas do 2D kontextu. */
export function drawAtlas(ctx: CanvasRenderingContext2D, L: AtlasLayout, pal: StickmanPalette, placeholderInk: string) {
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  for (const pose of POSES)
    for (const color of SIGN_COLORS)
      for (const shape of SIGN_SHAPES) {
        const f = L.silhouette.get(silKey(pose, color, shape))!;
        ctx.save();
        ctx.translate(f.x + f.ax, f.y + f.ay);
        ctx.scale(SIL_RES, SIL_RES);
        drawFigure(ctx, figureGeometry({ ...CANON, signShape: shape }, poseAt({ ...CANON, signShape: shape }, pose)), color, { ...pal });
        ctx.restore();
      }
  {
    const f = L.placeholder;
    ctx.save();
    ctx.translate(f.x + f.ax, f.y + f.ay);
    ctx.scale(SIL_RES, SIL_RES);
    const ph = { ...pal, ink: placeholderInk, signFill: { white: placeholderInk, blue: placeholderInk, red: placeholderInk } };
    drawFigure(ctx, figureGeometry({ ...CANON, hair: "none" }, poseAt(CANON, "drzi")), "white", ph);
    ctx.restore();
  }
  for (const hair of HAIR_STYLES)
    for (const g of [false, true]) {
      const f = L.head.get(headKey(hair, g))!;
      ctx.save();
      ctx.translate(f.x + f.ax, f.y + f.ay);
      drawHead(ctx, hair, g, pal, 8 * PART_RES, STROKE * PART_RES);
      ctx.restore();
    }
  for (const shape of SIGN_SHAPES)
    for (const color of SIGN_COLORS) {
      const f = L.sign.get(signKey(shape, color))!;
      const s = SIGN_SIZE[shape];
      ctx.save();
      ctx.translate(f.x + f.ax, f.y + f.ay);
      drawSign(ctx, s.w * PART_RES, s.h * PART_RES, color, pal, STROKE * PART_RES);
      ctx.restore();
    }
  {
    const f = L.scarf;
    ctx.save();
    ctx.translate(f.x + f.ax, f.y + f.ay);
    ctx.scale(PART_RES, PART_RES);
    drawScarf(ctx, { x: 0, y: 0, angle: 0, half: 6 }, 1, pal);
    ctx.restore();
  }
  {
    // Vlajka: bílý pruh, červený pruh, modrý klín do poloviny délky; obrys flag-edge (ink).
    const f = L.flag;
    const w = 66 * PART_RES;
    const h = 44 * PART_RES;
    const x0 = f.x + f.ax - w / 2;
    const y0 = f.y + f.ay - h / 2;
    ctx.fillStyle = pal.tricolor.white;
    ctx.fillRect(x0, y0, w, h / 2);
    ctx.fillStyle = pal.tricolor.red;
    ctx.fillRect(x0, y0 + h / 2, w, h / 2);
    ctx.fillStyle = pal.tricolor.blue;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + w / 2, y0 + h / 2);
    ctx.lineTo(x0, y0 + h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = PART_RES;
    ctx.strokeRect(x0 - PART_RES / 2, y0 - PART_RES / 2, w + PART_RES, h + PART_RES);
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(L.white.x - 2, L.white.y - 2, L.white.w + 4, L.white.h + 4);
}
