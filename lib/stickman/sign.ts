import type { SignColor } from "@/lib/demo/constants";
import { SIGN_SIZE } from "./geometry";
import type { SignShape } from "./params";

/**
 * Barvy panáčka a cedule. Cedule bílá / modrá / červená z tokenů design systému;
 * text na ceduli má vždy kontrastní barvu (ink na bílé, on-blue na modré a červené).
 */
export interface StickmanPalette {
  ink: string;
  /** Výplň hlavy (zakryje dav za ní). */
  surface: string;
  signFill: Record<SignColor, string>;
  signText: Record<SignColor, string>;
  /** Šála v trikolóře – oficiální barvy (stejné v obou motivech). */
  tricolor: { white: string; red: string; blue: string };
}

/** Světlý motiv jako hex – pro server (next/og) a canvas. */
export const PALETTE_LIGHT: StickmanPalette = {
  ink: "#0B1B33",
  surface: "#FFFFFF",
  signFill: { white: "#FFFFFF", blue: "#11457E", red: "#D7141A" },
  signText: { white: "#0B1B33", blue: "#FFFFFF", red: "#FFFFFF" },
  tricolor: { white: "#FFFFFF", red: "#D7141A", blue: "#11457E" },
};

/** Tmavý motiv jako hex (tokens.json). */
export const PALETTE_DARK: StickmanPalette = {
  ink: "#FFFFFF",
  surface: "#0B1B33",
  signFill: { white: "#0B1B33", blue: "#82B6F0", red: "#F79A9C" },
  signText: { white: "#FFFFFF", blue: "#0B1B33", red: "#0B1B33" },
  tricolor: { white: "#FFFFFF", red: "#D7141A", blue: "#11457E" },
};

/** CSS proměnné – pro SVG vložené do stránky (sleduje světlý/tmavý motiv). */
export const PALETTE_CSS: StickmanPalette = {
  ink: "var(--ink)",
  surface: "var(--surface)",
  signFill: { white: "var(--surface)", blue: "var(--blue)", red: "var(--red)" },
  signText: { white: "var(--ink)", blue: "var(--on-blue)", red: "var(--on-blue)" },
  tricolor: { white: "var(--flag-white)", red: "var(--flag-red)", blue: "var(--flag-blue)" },
};

/** Písmo cedule: Mona Sans Expanded 700 (plakátový řez webu). */
export const SIGN_FONT_WEIGHT = 700;
export const SIGN_LINE_HEIGHT = 1.12;
export const SIGN_MAX_LINES = 3;

/** Velikosti písma pro postavu výšky 1 (jednotky světa). */
export const SIGN_FONT: Record<SignShape, { max: number; min: number; padX: number; padY: number }> = {
  rect: { max: 9, min: 3.6, padX: 4, padY: 3.5 },
  banner: { max: 8.5, min: 3.4, padX: 5, padY: 3 },
  small: { max: 6.5, min: 2.6, padX: 3, padY: 2.5 },
};

/** Měření šířky textu (jednotky) – v prohlížeči canvas.measureText, jinak odhad. */
export type MeasureText = (text: string, fontSize: number) => number;

/** Konzervativní odhad šířky pro Mona Sans Expanded 700 (radši přeceňuje, ať text nepřeteče). */
export const estimateWidth: MeasureText = (text, size) => {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += 0.3;
    else if ("iljíĺ1.,:;'!|".includes(ch)) w += 0.34;
    else if ("ftrř()-".includes(ch)) w += 0.48;
    else if ("mwMWŽ".includes(ch) || ch === "@") w += 1.0;
    else if (ch >= "A" && ch <= "Z") w += 0.8;
    else if (/\p{Lu}/u.test(ch)) w += 0.8;
    else w += 0.66;
  }
  return w * size;
};

export interface SignTextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** Vnitřní plocha cedule (jednotky, pro výšku 1 × scale). */
  innerW: number;
  innerH: number;
}

function wrapAt(words: string[], maxW: number, size: number, measure: MeasureText): string[] | null {
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    if (measure(word, size) > maxW) return null;
    const next = cur ? `${cur} ${word}` : word;
    if (measure(next, size) <= maxW) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Tvrdé zalomení dlouhého slova po znacích (poslední záchrana při nejmenším písmu). */
function hardWrap(text: string, maxW: number, size: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (cur && measure(cur + ch, size) > maxW) {
      lines.push(cur.trimEnd());
      cur = ch === " " ? "" : ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

const layoutCache = new Map<string, SignTextLayout>();

/**
 * Zalomení textu cedule do max. 3 řádků se zmenšením písma. Výsledek je pro postavu výšky 1;
 * pro jinou výšku stačí vynásobit fontSize, innerW, innerH. Čistá funkce (cache jen pro odhad).
 */
export function layoutSignText(text: string, shape: SignShape, measure: MeasureText = estimateWidth): SignTextLayout {
  const clean = text.replace(/\s+/g, " ").trim();
  const key = measure === estimateWidth ? `${shape}\u0000${clean}` : "";
  if (key) {
    const hit = layoutCache.get(key);
    if (hit) return hit;
  }
  const f = SIGN_FONT[shape];
  const { w, h } = SIGN_SIZE[shape];
  const innerW = w - 2 * f.padX;
  const innerH = h - 2 * f.padY;
  const words = clean ? clean.split(" ") : [];
  let result: SignTextLayout | null = null;
  for (let size = f.max; size >= f.min - 1e-9; size = Math.round((size - 0.2) * 100) / 100) {
    const lines = wrapAt(words, innerW, size, measure);
    if (!lines) continue;
    if (lines.length <= SIGN_MAX_LINES && lines.length * size * SIGN_LINE_HEIGHT <= innerH + 1e-9) {
      result = { lines, fontSize: size, lineHeight: size * SIGN_LINE_HEIGHT, innerW, innerH };
      break;
    }
  }
  if (!result) {
    const size = f.min;
    let lines = hardWrap(clean, innerW, size, measure);
    if (lines.length > SIGN_MAX_LINES) {
      lines = lines.slice(0, SIGN_MAX_LINES);
      lines[SIGN_MAX_LINES - 1] = lines[SIGN_MAX_LINES - 1]!.replace(/.$/u, "…");
    }
    result = { lines, fontSize: size, lineHeight: size * SIGN_LINE_HEIGHT, innerW, innerH };
  }
  if (key) {
    if (layoutCache.size > 500) layoutCache.clear();
    layoutCache.set(key, result);
  }
  return result;
}
