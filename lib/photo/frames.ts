/**
 * Geometrie čtyř rámečků (design system PhotoFrame: ring / ribbon / corner / duotone)
 * v souřadnicích 1080 × 1080. Čistá logika – měření textu se předává zvenku
 * (v prohlížeči z canvasu, v testech náhradou), takže se dá testovat bez DOM.
 */
import { FRAME_R, type Variant } from "./constants";

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

/**
 * Kruhový pruh: horní půlka modrá (slogan), dolní červená, bílá linka uvnitř.
 * Vnější hrana pruhu = kruhový ořez (540), fotka je jen uvnitř `photoRadius`.
 */
export const RING = {
  bandRadius: 470,
  bandWidth: 140,
  innerLineRadius: 394,
  lineWidth: 14,
  /** Fotka končí na vnitřní hraně pruhu (pod bílou linkou, takže bez švu). */
  photoRadius: 400,
  /** Střed písmen na horním oblouku (písmo „dolů“ míří ke středu). */
  textRadius: 462,
  /** Střed písmen na dolním oblouku (písmo „dolů“ míří ven, posun je zrcadlový). */
  bottomTextRadius: 478,
  /** Text smí zabrat nejvýš tento úhel oblouku (zbytek = okraje u bílých dělítek). */
  maxTextAngle: Math.PI * 0.8,
  letterSpacing: 2,
  preferredFontSize: 60,
  /** Pod touto velikostí se slogan rozdělí na horní a dolní oblouk. */
  splitBelowFontSize: 50,
  minFontSize: 32,
} as const;

export interface Glyph {
  ch: string;
  x: number;
  y: number;
  /** Natočení písmene v radiánech (0 = vodorovně, nahoře či dole oblouku). */
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
 * Rozmístí znaky po oblouku kružnice (střed cx, cy, poloměr r), vystředěné nahoře
 * (`side: "top"`) nebo dole (`"bottom"`), v obou případech čtené zleva doprava
 * a písmeny nahoru. Úhel 0 = vpravo, −π/2 = nahoře, π/2 = dole (osa y dolů).
 */
export function arcLayout(
  text: string,
  {
    cx = FRAME_R,
    cy = FRAME_R,
    r,
    side = "top",
    fontSize,
    letterSpacing = RING.letterSpacing,
    measure,
  }: {
    cx?: number;
    cy?: number;
    r?: number;
    side?: "top" | "bottom";
    fontSize: number;
    letterSpacing?: number;
    measure: Measure;
  },
): Glyph[] {
  const radius = r ?? (side === "top" ? RING.textRadius : RING.bottomTextRadius);
  const chars = Array.from(text);
  const adv = glyphAdvances(text, fontSize, measure, letterSpacing);
  const total = adv.reduce((s, a) => s + a, 0) - (adv.length ? letterSpacing : 0);
  // Nahoře roste úhel zleva doprava, dole klesá (π vlevo → 0 vpravo).
  const dir = side === "top" ? 1 : -1;
  const center = side === "top" ? -Math.PI / 2 : Math.PI / 2;
  let cursor = center - (dir * total) / (2 * radius);
  return chars.map((ch, i) => {
    const w = adv[i]! - letterSpacing;
    const mid = cursor + (dir * w) / 2 / radius;
    cursor += (dir * adv[i]!) / radius;
    return {
      ch,
      x: cx + radius * Math.cos(mid),
      y: cy + radius * Math.sin(mid),
      rotation: side === "top" ? mid + Math.PI / 2 : mid - Math.PI / 2,
    };
  });
}

/** Rozdělení na dva řádky s co nejpodobnější šířkou (podle měření, ne počtu znaků). */
export function splitByWidth(text: string, fontSize: number, measure: Measure): [string, string] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text, ""];
  let best: [string, string] = [words.join(" "), ""];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(measure(a, fontSize) - measure(b, fontSize));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

export interface RingLayout {
  fontSize: number;
  top: Glyph[];
  /** Druhá půlka dlouhého sloganu na dolním (červeném) oblouku; jinak prázdné. */
  bottom: Glyph[];
}

/**
 * Slogan na kruhovém pruhu: krátký celý nahoře; dlouhý (vešel by se jen malým
 * písmem) rozdělený na horní a dolní oblouk se stejnou velikostí písma.
 */
export function ringLayout(text: string, measure: Measure): RingLayout {
  const single = fitArcFontSize(text, RING.textRadius, RING.maxTextAngle, measure);
  const [a, b] = splitByWidth(text, RING.preferredFontSize, measure);
  if (single >= RING.splitBelowFontSize || !b) {
    return { fontSize: single, top: arcLayout(text, { side: "top", fontSize: single, measure }), bottom: [] };
  }
  const fs = Math.min(
    fitArcFontSize(a, RING.textRadius, RING.maxTextAngle, measure),
    fitArcFontSize(b, RING.bottomTextRadius, RING.maxTextAngle, measure),
  );
  return {
    fontSize: fs,
    top: arcLayout(a, { side: "top", fontSize: fs, measure }),
    bottom: arcLayout(b, { side: "bottom", fontSize: fs, measure }),
  };
}

/**
 * Kde smí být fotka: poloměr kruhu (kolem středu rámečku), nebo null = celý čtverec.
 * Kruh: jen uvnitř pruhu; mimo vnější kruh (rohy) se nekreslí nic, takže PNG má
 * průhledné a JPG bílé rohy. Ostatní varianty jsou čtvercové návrhy (pruh / vlajka /
 * duotón přes celou plochu) – vše podstatné leží v kruhu, rohy patří k fotce.
 */
export function photoClipRadius(variant: Variant): number | null {
  return variant === "ring" ? RING.photoRadius : null;
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

/**
 * Vlajka v rohu: celá, 3 : 2, přímo na fotce jen s tenkým tmavým obrysem
 * (bez bílé plochy – rozhodnutí vlastníka 2026-10-28, viz DECISIONS.md).
 * Celá leží uvnitř kruhového ořezu sociálních sítí.
 */
export const CORNER = { x: 636, y: 716, w: 260 } as const;

export interface FlagGeometry {
  white: { x: number; y: number; w: number; h: number };
  red: { x: number; y: number; w: number; h: number };
  wedge: [number, number][];
  /** Obrys vně vlajky (tah celý mimo plochu vlajky). */
  outline: { x: number; y: number; w: number; h: number; stroke: number };
}

export function flagGeometry(x: number, y: number, w: number): FlagGeometry {
  const h = (w * 2) / 3;
  const sw = 2;
  return {
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

