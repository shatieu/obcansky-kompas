/**
 * Kreslení rámečku do canvasu (prohlížeč). Stejná funkce slouží pro náhled
 * (menší plátno) i export 1080 × 1080, takže náhled = výsledek.
 * Rámečky jsou statické (design system pohyb.md §6).
 */
import { COLORS, FRAME_R, FRAME_SIZE, JPEG_QUALITY, type Variant } from "./constants";
import { drawRect, type Crop, type Size } from "./crop";
import { stripJpegMetadata, stripPngMetadata } from "./exif";
import { exportPlan, type ExportFormat } from "./export";
import {
  CORNER,
  RING,
  RIBBON,
  DUOTONE,
  applyDuotone,
  arcLayout,
  duotoneLayout,
  fitArcFontSize,
  flagGeometry,
  ribbonLayout,
  type Measure,
} from "./frames";

export interface FrameFont {
  family: string;
  /** Hodnota pro ctx.fontStretch (např. "expanded" pro Mona Sans Expanded přes osu wdth). */
  stretch: CanvasFontStretch;
}

export interface RenderInput {
  photo: { source: CanvasImageSource; size: Size; crop: Crop } | null;
  variant: Variant;
  /** Text sloganu ze slogans.yaml (u varianty corner se nepoužije). */
  slogan: string;
  font: FrameFont;
  placeholder: string;
}

const fontString = (font: FrameFont, size: number, weight = 800) => `${weight} ${size}px ${font.family}`;

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function makeMeasure(ctx: CanvasRenderingContext2D, font: FrameFont, letterSpacing = 0): Measure {
  return (text, size) => {
    ctx.font = fontString(font, size);
    setLetterSpacing(ctx, letterSpacing);
    return ctx.measureText(text).width;
  };
}

function drawPhoto(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const { photo } = input;
  ctx.fillStyle = COLORS.tint;
  ctx.fillRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  if (!photo) {
    ctx.fillStyle = COLORS.inkSecondary;
    ctx.font = fontString(input.font, 60, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(input.placeholder, FRAME_R, FRAME_R - 160);
    return;
  }
  const r = drawRect(photo.crop, photo.size, FRAME_SIZE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(photo.source, r.x, r.y, r.w, r.h);
}

/** Fotka v duotónu: kreslí se v rozlišení plátna, pixely se přebarví. */
function drawDuotonePhoto(ctx: CanvasRenderingContext2D, side: number, input: RenderInput) {
  ctx.fillStyle = COLORS.flagBlue;
  ctx.fillRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  const { photo } = input;
  if (!photo) return;
  const tmp = document.createElement("canvas");
  tmp.width = side;
  tmp.height = side;
  const t = tmp.getContext("2d", { willReadFrequently: true });
  if (!t) return;
  const r = drawRect(photo.crop, photo.size, side);
  t.imageSmoothingQuality = "high";
  t.drawImage(photo.source, r.x, r.y, r.w, r.h);
  const img = t.getImageData(0, 0, side, side);
  applyDuotone(img.data);
  t.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, FRAME_SIZE, FRAME_SIZE);
}

function drawRing(ctx: CanvasRenderingContext2D, input: RenderInput) {
  ctx.lineCap = "butt";
  ctx.lineWidth = RING.bandWidth;
  ctx.strokeStyle = COLORS.flagBlue;
  ctx.beginPath();
  ctx.arc(FRAME_R, FRAME_R, RING.bandRadius, Math.PI, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = COLORS.flagRed;
  ctx.beginPath();
  ctx.arc(FRAME_R, FRAME_R, RING.bandRadius, 0, Math.PI);
  ctx.stroke();

  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = RING.lineWidth;
  ctx.beginPath();
  ctx.arc(FRAME_R, FRAME_R, RING.innerLineRadius, 0, 2 * Math.PI);
  ctx.stroke();
  const outer = RING.bandRadius + RING.bandWidth / 2;
  const inner = RING.bandRadius - RING.bandWidth / 2;
  ctx.beginPath();
  ctx.moveTo(FRAME_R - outer, FRAME_R);
  ctx.lineTo(FRAME_R - inner, FRAME_R);
  ctx.moveTo(FRAME_R + inner, FRAME_R);
  ctx.lineTo(FRAME_R + outer, FRAME_R);
  ctx.stroke();

  const text = input.slogan.toLocaleUpperCase("cs");
  const measure = makeMeasure(ctx, input.font, 0);
  const fontSize = fitArcFontSize(text, RING.textRadius, RING.maxTextAngle, measure);
  const glyphs = arcLayout(text, { fontSize, measure });
  ctx.font = fontString(input.font, fontSize);
  setLetterSpacing(ctx, 0);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rotation);
    ctx.fillText(g.ch, 0, 0);
    ctx.restore();
  }
}

function drawRibbon(ctx: CanvasRenderingContext2D, input: RenderInput) {
  ctx.fillStyle = COLORS.flagBlue;
  ctx.fillRect(0, RIBBON.top, FRAME_SIZE, RIBBON.height);
  ctx.fillStyle = COLORS.flagRed;
  ctx.fillRect(0, RIBBON.redTop, FRAME_SIZE, RIBBON.redHeight);
  const text = input.slogan.toLocaleUpperCase("cs");
  const layout = ribbonLayout(text, makeMeasure(ctx, input.font, 0));
  ctx.font = fontString(input.font, layout.fontSize);
  setLetterSpacing(ctx, 0);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  layout.lines.forEach((l, i) => ctx.fillText(l, FRAME_R, layout.ys[i]!));
}

function drawCorner(ctx: CanvasRenderingContext2D) {
  const g = flagGeometry(CORNER.x, CORNER.y, CORNER.w);
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(g.plate.x, g.plate.y, g.plate.w, g.plate.h);
  ctx.fillRect(g.white.x, g.white.y, g.white.w, g.white.h);
  ctx.fillStyle = COLORS.flagRed;
  ctx.fillRect(g.red.x, g.red.y, g.red.w, g.red.h);
  ctx.fillStyle = COLORS.flagBlue;
  ctx.beginPath();
  g.wedge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COLORS.navy;
  ctx.lineWidth = g.outline.stroke;
  ctx.strokeRect(g.outline.x, g.outline.y, g.outline.w, g.outline.h);
}

function drawDuotoneText(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const text = input.slogan.toLocaleUpperCase("cs");
  const layout = duotoneLayout(text, makeMeasure(ctx, input.font, DUOTONE.letterSpacing));
  ctx.font = fontString(input.font, layout.fontSize);
  setLetterSpacing(ctx, DUOTONE.letterSpacing);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  layout.lines.forEach((l, i) => ctx.fillText(l, FRAME_R, layout.ys[i]!));
  setLetterSpacing(ctx, 0);
  ctx.fillStyle = COLORS.flagRed;
  ctx.fillRect(layout.bar.x, layout.bar.y, layout.bar.w, layout.bar.h);
}

/** Nakreslí celý rámeček na plátno o straně `side` px. */
export function renderFrame(ctx: CanvasRenderingContext2D, side: number, input: RenderInput): void {
  ctx.save();
  const k = side / FRAME_SIZE;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if ("fontStretch" in ctx) ctx.fontStretch = input.font.stretch;
  if (input.variant === "duotone") drawDuotonePhoto(ctx, side, input);
  else drawPhoto(ctx, input);
  if (input.variant === "ring") drawRing(ctx, input);
  else if (input.variant === "ribbon") drawRibbon(ctx, input);
  else if (input.variant === "corner") drawCorner(ctx);
  else drawDuotoneText(ctx, input);
  ctx.restore();
}

/**
 * Písmo rámečků = nadpisové písmo webu (Mona Sans Expanded přes utilitu `font-wide`,
 * jinak písmo stránky). Čeká na načtení, aby canvas nekreslil náhradním písmem.
 */
export async function resolveFrameFont(): Promise<FrameFont> {
  const probe = document.createElement("span");
  probe.className = "font-wide";
  probe.style.cssText = "position:absolute;visibility:hidden;font-weight:800;font-size:60px";
  probe.textContent = "MÉDIA ŘČŮ";
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const family = cs.fontFamily || "sans-serif";
  const st = cs.fontStretch;
  probe.remove();
  const pct = st.endsWith("%") ? parseFloat(st) : NaN;
  const stretch: CanvasFontStretch =
    st === "expanded" || pct >= 125 ? "expanded" : st === "semi-expanded" || pct >= 112.5 ? "semi-expanded" : "normal";
  try {
    await document.fonts.load(`800 60px ${family}`, "MÉDIA ŘČŮ");
    await document.fonts.load(`700 60px ${family}`, "Tvoje fotka");
  } catch {
    // Písmo se nenačetlo – canvas použije náhradní, rámeček je pořád v pořádku.
  }
  return { family, stretch };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob selhalo"))), type, quality),
  );
}

/**
 * Export 1080 × 1080: nové plátno, znovu zakódováno z canvasu (žádná metadata
 * původní fotky) a pro jistotu ještě očištěno od EXIF/textových bloků.
 */
export async function exportFrame(input: RenderInput, format: ExportFormat): Promise<Blob> {
  const plan = exportPlan(format);
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d není k dispozici");
  if (plan.opaque) {
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(0, 0, plan.width, plan.height);
  }
  renderFrame(ctx, plan.width, input);
  const blob = await toBlob(canvas, plan.mime, plan.quality ?? JPEG_QUALITY);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const clean = format === "jpg" ? stripJpegMetadata(bytes) : stripPngMetadata(bytes);
  return new Blob([clean as BlobPart], { type: plan.mime });
}
