/**
 * Geometrie čtyř rámečků (design system PhotoFrame: ring / ribbon / corner / duotone)
 * v souřadnicích 1080 × 1080. Čistá logika – měření textu se předává zvenku
 * (v prohlížeči z canvasu, v testech náhradou), takže se dá testovat bez DOM.
 */
import { FRAME_R } from "./constants";

/** Šířka textu v px při dané velikosti písma. */
export type Measure = (text: string, fontSize: number) => number;

/** Šířka tětivy kruhového ořezu ve výšce y (0 mimo kruh). */
export function chordWidth(y: number, r = FRAME_R, cy = FRAME_R): number {
  const d = y - cy;
  return Math.abs(d) >= r ? 0 : 2 * Math.sqrt(r * r - d * d);
}

/** Leží obdélník celý uvnitř kruhového ořezu? */
export function rectInsideCircle(x: number, y: number, w: number, h: number, r = FRAME_R): boolean {
  return [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ].every(([px, py]) => Math.hypot(px! - r, py! - r) <= r);
}

/* ------------------------------------------------------------------ ring */

/** Kruhový pruh: horní půlka modrá (slogan), dolní červená, bílá linka uvnitř. */
export const RING = {
  bandRadius: 470,
  bandWidth: 140,
  innerLineRadius: 394,
  lineWidth: 14,
  textRadius: 462,
  /** Text smí zabrat nejvýš tento úhel horního oblouku (zbytek = okraje u bílých dělítek). */
  maxTextAngle: Math.PI * 0.8,
  letterSpacing: 2,
  preferredFontSize: 60,
  minFontSize: 32,
} as const;

export interface Glyph {
  ch: string;
  x: number;
  y: number;
  /** Natočení písmene v radiánech (0 = vodorovně, nahoře oblouku). */
  rotation: number;
}

/** Šířky jednotlivých znaků + mezery mezi nimi. */
function glyphAdvances(text: string, fontSize: number, measure: Measure, letterSpacing: number): number[] {
  return Array.from(text).map((ch) => measure(ch, fontSize) + letterSpacing);
}

/** Úhel, který text zabere na oblouku o poloměru r. */
export function arcAngle(text: string, fontSize: number, r: number, measure: Measure, letterSpacing = 0): number {
  const adv = glyphAdvances(text, fontSize, measure, letterSpacing);
  const total = adv.reduce((s, a) => s + a, 0) - (adv.length ? letterSpacing : 0);
  return total / r;
}

/** Největší velikost písma (po 2 px), při které se text vejde do `maxAngle`. */
export function fitArcFontSize(
  text: string,
  r: number,
  maxAngle: number,
  measure: Measure,
  { preferred = RING.preferredFontSize, min = RING.minFontSize, letterSpacing = RING.letterSpacing } = {},
): number {
  for (let fs = preferred; fs > min; fs -= 2) {
    if (arcAngle(text, fs, r, measure, letterSpacing) <= maxAngle) return fs;
  }
  return min;
}

/**
 * Rozmístí znaky po horním oblouku kružnice (střed cx, cy, poloměr r), vystředěné
 * nahoře, čtené zleva doprava. Úhel 0 = vpravo, −π/2 = nahoře (osa y dolů).
 */
export function arcLayout(
  text: string,
  { cx = FRAME_R, cy = FRAME_R, r = RING.textRadius, fontSize, letterSpacing = RING.letterSpacing, measure }: {
    cx?: number;
    cy?: number;
    r?: number;
    fontSize: number;
    letterSpacing?: number;
    measure: Measure;
  },
): Glyph[] {
  const chars = Array.from(text);
  const adv = glyphAdvances(text, fontSize, measure, letterSpacing);
  const total = adv.reduce((s, a) => s + a, 0) - (adv.length ? letterSpacing : 0);
  let cursor = -Math.PI / 2 - total / (2 * r);
  return chars.map((ch, i) => {
    const w = adv[i]! - letterSpacing;
    const mid = cursor + w / 2 / r;
    cursor += adv[i]! / r;
    return { ch, x: cx + r * Math.cos(mid), y: cy + r * Math.sin(mid), rotation: mid + Math.PI / 2 };
  });
}

/* ---------------------------------------------------------------- ribbon */

/** Stuha přes spodní třetinu: modrý pruh 700–870, červená linka 870–898. */
export const RIBBON = {
  top: 700,
  height: 170,
  redTop: 870,
  redHeight: 28,
  centerY: 785,
  margin: 48,
  preferredFontSize: 62,
  minFontSize: 30,
} as const;

export interface TextBlock {
  lines: string[];
  fontSize: number;
  /** Střed každého řádku (textBaseline = "middle"). */
  ys: number[];
}

/** Šířka dostupná pro řádek se středem `y` a výškou písma `fs` (kruhový ořez). */
function availableWidth(y: number, fs: number, margin: number): number {
  const half = fs * 0.4;
  return Math.min(chordWidth(y - half), chordWidth(y + half)) - 2 * margin;
}

/** Rozdělí slova na dva řádky co nejrovnoměrněji (podle počtu znaků). */
export function splitBalanced(text: string): [string, string] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text, ""];
  let best: [string, string] = [words.join(" "), ""];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

export function ribbonLayout(text: string, measure: Measure): TextBlock {
  const { centerY, margin, preferredFontSize, minFontSize, height } = RIBBON;
  for (let fs = preferredFontSize; fs >= 44; fs -= 2) {
    if (measure(text, fs) <= availableWidth(centerY, fs, margin)) return { lines: [text], fontSize: fs, ys: [centerY] };
  }
  const [a, b] = splitBalanced(text);
  if (b) {
    for (let fs = 56; fs >= minFontSize; fs -= 2) {
      const lh = fs * 1.1;
      const ys = [centerY - lh / 2, centerY + lh / 2];
      if (lh * 2 > height - 16) continue;
      if (measure(a, fs) <= availableWidth(ys[0]!, fs, margin) && measure(b, fs) <= availableWidth(ys[1]!, fs, margin)) {
        return { lines: [a, b], fontSize: fs, ys };
      }
    }
    const lh = minFontSize * 1.1;
    return { lines: [a, b], fontSize: minFontSize, ys: [centerY - lh / 2, centerY + lh / 2] };
  }
  return { lines: [text], fontSize: minFontSize, ys: [centerY] };
}

/* ---------------------------------------------------------------- corner */

/** Vlajka v rohu: celá, 3 : 2, sama na bílé ploše s okrajem ≥ ¼ výšky, 1px linka. */
export const CORNER = { x: 600, y: 700, w: 240 } as const;

export interface FlagGeometry {
  /** Bílá plocha pro ochranný prostor kolem vlajky. */
  plate: { x: number; y: number; w: number; h: number };
  white: { x: number; y: number; w: number; h: number };
  red: { x: number; y: number; w: number; h: number };
  wedge: [number, number][];
  outline: { x: number; y: number; w: number; h: number; stroke: number };
}

export function flagGeometry(x: number, y: number, w: number): FlagGeometry {
  const h = (w * 2) / 3;
  const pad = h / 4;
  const sw = Math.max(2, w / 120);
  return {
    plate: { x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad },
    white: { x, y, w, h: h / 2 },
    red: { x, y: y + h / 2, w, h: h / 2 },
    wedge: [
      [x, y],
      [x + w / 2, y + h / 2],
      [x, y + h],
    ],
    outline: { x: x - sw / 2, y: y - sw / 2, w: w + sw, h: h + sw, stroke: sw },
  };
}

/* --------------------------------------------------------------- duotone */

export const DUOTONE = {
  maxChars: 10,
  preferredFontSize: 104,
  minFontSize: 56,
  /** Řádkování jako v návrhu: 112 při písmu 104. */
  lineRatio: 112 / 104,
  margin: 56,
  letterSpacing: -3,
  bar: { w: 300, h: 24, gap: 50 },
} as const;

/** Zalomení po slovech jako v návrhu: řádek max. `maxChars` znaků (dlouhé slovo zůstane celé). */
export function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && `${cur} ${w}`.length > maxChars) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface DuotoneLayout extends TextBlock {
  bar: { x: number; y: number; w: number; h: number };
}

/** Slogan přes střed velkým písmem + červená linka pod ním. `ys` jsou středy řádků. */
export function duotoneLayout(text: string, measure: Measure): DuotoneLayout {
  const lines = wrapWords(text, DUOTONE.maxChars);
  const n = lines.length;
  const build = (fs: number): DuotoneLayout => {
    const lh = fs * DUOTONE.lineRatio;
    const capHalf = fs * 0.36; // polovina výšky verzálek
    // Blok = řádky + mezera + linka, vystředěný na střed kruhu.
    const blockH = (n - 1) * lh + 2 * capHalf + DUOTONE.bar.gap + DUOTONE.bar.h;
    const first = FRAME_R - blockH / 2 + capHalf;
    const ys = lines.map((_, i) => first + i * lh);
    const barY = ys[n - 1]! + capHalf + DUOTONE.bar.gap;
    return {
      lines,
      fontSize: fs,
      ys,
      bar: { x: FRAME_R - DUOTONE.bar.w / 2, y: barY, w: DUOTONE.bar.w, h: DUOTONE.bar.h },
    };
  };
  for (let fs = DUOTONE.preferredFontSize; fs > DUOTONE.minFontSize; fs -= 4) {
    const l = build(fs);
    const fits = l.lines.every((line, i) => measure(line, fs) <= availableWidth(l.ys[i]!, fs, DUOTONE.margin));
    if (fits) return l;
  }
  return build(DUOTONE.minFontSize);
}

/** Duotón: jas → přechod z modré vlajky (#11457E) do bílé. Mění pole RGBA na místě. */
export function applyDuotone(data: Uint8ClampedArray): void {
  const lo = [0x11, 0x45, 0x7e] as const;
  for (let i = 0; i < data.length; i += 4) {
    const t = (0.3 * data[i]! + 0.59 * data[i + 1]! + 0.11 * data[i + 2]!) / 255;
    data[i] = lo[0] + (255 - lo[0]) * t;
    data[i + 1] = lo[1] + (255 - lo[1]) * t;
    data[i + 2] = lo[2] + (255 - lo[2]) * t;
  }
}

