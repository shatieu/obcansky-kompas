import type { ShareCard } from "./card";
import { layoutCard, type ClientFormat, type DrawOp, type FontKind } from "./layout";
import { COLORS, FORMATS } from "./style";
import { CROWD_PALETTE, FG_PALETTE, type Placed } from "./demonstrace";
import { hasSign } from "@/lib/demo/constants";
import { drawFigure } from "@/lib/stickman/canvas";
import { figureGeometry } from "@/lib/stickman/geometry";
import { generateStickman } from "@/lib/stickman/params";
import { poseAt } from "@/lib/stickman/poses";
import { layoutSignText } from "@/lib/stickman/sign";

/**
 * Story 1080×1920 a čtverec 1080×1080 v prohlížeči (SPEC §9.4). Písmo Mona Sans se načte
 * líně ze stejných TTF jako OG (samostatné chunky, nejsou v JS stránky). Jen prohlížeč.
 */
const FAMILY: Record<FontKind, string> = { wide: "KompasShareWide", sans: "KompasShareSans" };
const WEIGHT: Record<FontKind, number> = { wide: 800, sans: 600 };

function toBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

let fontsReady: Promise<boolean> | null = null;

export function loadShareFonts(): Promise<boolean> {
  fontsReady ??= (async () => {
    try {
      const [wide, sans] = await Promise.all([import("./fonts/mona-sans-expanded-extrabold"), import("@/lib/export/fonts/mona-sans-semibold")]);
      const faces = [
        new FontFace(FAMILY.wide, toBuffer(wide.FONT_BASE64), { weight: String(WEIGHT.wide) }),
        new FontFace(FAMILY.sans, toBuffer(sans.FONT_BASE64), { weight: String(WEIGHT.sans) }),
      ];
      await Promise.all(faces.map((f) => f.load()));
      for (const f of faces) document.fonts.add(f);
      return true;
    } catch {
      return false; // nouzově systémové písmo – obrázek vznikne i tak
    }
  })();
  return fontsReady;
}

const fontCss = (font: FontKind, size: number) => `${WEIGHT[font]} ${Math.round(size * 10) / 10}px ${FAMILY[font]}, system-ui, sans-serif`;

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

function drawFlag(ctx: Ctx, x: number, y: number, w: number) {
  const h = (w * 2) / 3;
  const edge = Math.max(2, w / 120);
  ctx.fillStyle = COLORS.onNight; // obrys vně vlajky (na noční ploše bílý)
  ctx.fillRect(x - edge, y - edge, w + edge * 2, h + edge * 2);
  ctx.fillStyle = COLORS.flagWhite;
  ctx.fillRect(x, y, w, h / 2);
  ctx.fillStyle = COLORS.flagRed;
  ctx.fillRect(x, y + h / 2, w, h / 2);
  ctx.fillStyle = COLORS.flagBlue;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawPhoto(ctx: Ctx, photo: CanvasImageSource & { width: number; height: number }, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const iw = Number(photo.width);
  const ih = Number(photo.height);
  const scale = Math.max((r * 2) / iw, (r * 2) / ih);
  ctx.drawImage(photo, cx - (iw * scale) / 2, cy - (ih * scale) / 2, iw * scale, ih * scale);
  ctx.restore();
}

/** Panáček demonstrace: tělo přes lib/stickman/canvas, text cedule písmem obrázku. */
function drawStickman(ctx: Ctx, p: Placed) {
  const params = generateStickman(p.seed);
  const fig = figureGeometry(params, poseAt(params, p.pose, undefined, hasSign(p.signColor)));
  const pal = p.layer === "fg" ? FG_PALETTE : CROWD_PALETTE;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(p.scale, p.scale);
  drawFigure(ctx, fig, p.signColor, pal);
  const sign = fig.sign;
  if (sign && hasSign(p.signColor) && p.signText.trim()) {
    const paint = p.signColor;
    // Rozložení textu nechá v kontextu prostrkání z měření nadpisu – cedule ho mít nesmí.
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    const measure = (t: string, size: number) => {
      ctx.font = fontCss("wide", size);
      return ctx.measureText(t).width;
    };
    // Měření v jednotkách postavy (výška 1) – stejně jako layoutSignText očekává.
    const lay = layoutSignText(p.signText, params.signShape, measure);
    const fs = lay.fontSize * fig.scale;
    const lh = lay.lineHeight * fig.scale;
    ctx.translate(sign.x, sign.y);
    ctx.rotate((sign.angle * Math.PI) / 180);
    ctx.fillStyle = pal.signText[paint];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.font = fontCss("wide", fs);
    const top = -((lay.lines.length - 1) * lh) / 2;
    lay.lines.forEach((l, i) => ctx.fillText(l, 0, top + i * lh));
  }
  ctx.restore();
}

function draw(ctx: Ctx, ops: DrawOp[], photo?: CanvasImageSource & { width: number; height: number }) {
  for (const op of ops) {
    if (op.t === "stickman") drawStickman(ctx, op);
    else if (op.t === "rect") {
      ctx.fillStyle = op.fill;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.t === "flag") drawFlag(ctx, op.x, op.y, op.w);
    else if (op.t === "photo") {
      if (photo) drawPhoto(ctx, photo, op.cx, op.cy, op.r);
    } else {
      ctx.font = fontCss(op.font, op.size);
      ctx.fillStyle = op.fill;
      ctx.textAlign = op.align;
      ctx.textBaseline = "alphabetic";
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${op.spacing}px`;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}

export async function renderShareImage(
  card: ShareCard,
  format: ClientFormat,
  opts: { photo?: CanvasImageSource & { width: number; height: number } } = {},
): Promise<Blob> {
  await loadShareFonts();
  const { width, height } = FORMATS[format];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d") as Ctx | null;
  if (!ctx) throw new Error("canvas 2d není k dispozici");
  const measure = (text: string, font: FontKind, size: number, spacing: number) => {
    ctx.font = fontCss(font, size);
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    return ctx.measureText(text).width;
  };
  draw(ctx, layoutCard(card, format, measure, { photo: Boolean(opts.photo) }), opts.photo);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob selhalo"))), "image/png"));
}

export function shareFileName(card: ShareCard, format: ClientFormat): string {
  return `obcansky-kompas-${card.moment}-${format}.png`;
}
