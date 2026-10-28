import type { ShareCard } from "./card";
import { demoScene, type Box, type Placed } from "./demonstrace";
import { COLORS, FORMATS } from "./style";
import { wrapText } from "./wrap";

/**
 * Rozvržení Story (1080×1920) a čtverce (1080×1080) podle ShareImage z design systému.
 * Čistá funkce: vrací seznam kreslicích operací, canvas.ts je jen vykreslí. Měření textu
 * dodá volající, takže se dá testovat bez prohlížeče (vejde se do plochy, vlajka zůstane sama).
 */
export type FontKind = "wide" | "sans";

export type DrawOp =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string }
  | { t: "text"; x: number; y: number; text: string; font: FontKind; size: number; fill: string; align: "left" | "right" | "center"; spacing: number }
  | { t: "flag"; x: number; y: number; w: number }
  | { t: "photo"; cx: number; cy: number; r: number }
  /** Panáček online demonstrace (chodidla v x,y; scale = px na jednotku postavy). */
  | ({ t: "stickman" } & Placed);

export type Measure = (text: string, font: FontKind, size: number, spacing: number) => number;

export type ClientFormat = "story" | "square";

interface Spec {
  pad: number;
  flag: { x: number; y: number; w: number };
  /** Horní hrana obsahu a spodní hranice, kam obsah smí. */
  top: number;
  bottom: number;
  brand: { x: number; y: number; size: number; align: "left" | "right" };
  name: { x: number; y: number; size: number; align: "left" | "right" };
  headline: number;
  big: number;
  kicker: number;
  line: number;
  item: number;
  itemGap: number;
  blockGap: number;
  photo: number;
}

const SPECS: Record<ClientFormat, Spec> = {
  story: {
    pad: 88,
    flag: { x: 88, y: 160, w: 330 },
    top: 560,
    bottom: 1920 - 260,
    brand: { x: 88, y: 1920 - 110, size: 40, align: "left" },
    name: { x: 88, y: 1920 - 180, size: 36, align: "left" },
    headline: 92,
    big: 300,
    kicker: 30,
    line: 40,
    item: 42,
    itemGap: 20,
    blockGap: 80,
    photo: 640,
  },
  square: {
    pad: 80,
    flag: { x: 80, y: 80, w: 180 },
    top: 290,
    bottom: 1080 - 80,
    brand: { x: 1080 - 80, y: 130, size: 30, align: "right" },
    name: { x: 1080 - 80, y: 176, size: 28, align: "right" },
    headline: 68,
    big: 200,
    kicker: 24,
    line: 32,
    item: 34,
    itemGap: 16,
    blockGap: 48,
    photo: 400,
  },
};

const LH = { headline: 1.05, big: 1, kicker: 1.3, line: 1.3, item: 1.2 };

export function layoutCard(card: ShareCard, format: ClientFormat, measure: Measure, opts: { photo?: boolean } = {}): DrawOp[] {
  if (card.figure) return layoutDemoCard(card, format, measure);
  const s = SPECS[format];
  const { width: W, height: H } = FORMATS[format];
  const maxW = W - s.pad * 2;

  const build = (k: number): { ops: DrawOp[]; end: number } => {
    const ops: DrawOp[] = [];
    let y = s.top;
    const text = (t: string, font: FontKind, size: number, lh: number, fill: string, spacing: number, maxLines = Infinity) => {
      for (const line of wrapText(t, maxW, (x) => measure(x, font, size, spacing), maxLines)) {
        y += size * lh;
        ops.push({ t: "text", x: s.pad, y: y - size * (lh - 1) - size * 0.18, text: line, font, size, fill, align: "left", spacing });
      }
    };
    if (card.kicker) {
      text(card.kicker, "wide", s.kicker * k, LH.kicker, COLORS.nightAccent, 3 * k, 2);
      y += 12 * k;
    }
    if (card.big) text(card.big, "wide", s.big * k, LH.big, COLORS.onNight, -6 * k, 1);
    text(card.headline, "wide", s.headline * k, LH.headline, COLORS.onNight, -3 * k, 6);
    if (card.line) {
      y += 24 * k;
      text(card.line, "sans", s.line * k, LH.line, COLORS.onNight, 0, 4);
    }
    if (opts.photo) {
      y += s.blockGap * k;
      const d = s.photo * k;
      ops.push({ t: "photo", cx: s.pad + d / 2, cy: y + d / 2, r: d / 2 });
      y += d;
    } else if (card.items.length) {
      y += s.blockGap * k;
      const fs = s.item * k;
      const padY = fs * 0.5;
      const padX = fs * 0.7;
      const num = card.numbered ? fs * 1.5 : 0;
      const gap = card.numbered ? fs * 0.6 : 0;
      const textW = maxW - padX * 2 - num - gap;
      const capSize = Math.round(fs * 0.42);
      card.items.slice(0, card.numbered ? 3 : 6).forEach((it, i) => {
        const labelLines = wrapText(it.label, textW, (x) => measure(x, "sans", fs, 0), 3);
        const capH = it.caption ? capSize * 1.4 : 0;
        const textH = capH + labelLines.length * fs * LH.item;
        const h = padY * 2 + Math.max(num, textH);
        ops.push({ t: "rect", x: s.pad, y, w: maxW, h, fill: COLORS.flagWhite });
        if (card.numbered) {
          const ny = y + (h - num) / 2;
          ops.push({ t: "rect", x: s.pad + padX, y: ny, w: num, h: num, fill: COLORS.flagBlue });
          ops.push({ t: "text", x: s.pad + padX + num / 2, y: ny + num / 2 + fs * 0.28, text: String(i + 1), font: "wide", size: fs * 0.8, fill: COLORS.flagWhite, align: "center", spacing: 0 });
        }
        const tx = s.pad + padX + num + gap;
        let ty = y + (h - textH) / 2;
        if (it.caption) {
          ops.push({ t: "text", x: tx, y: ty + capSize, text: it.caption.toUpperCase(), font: "wide", size: capSize, fill: COLORS.inkSecondary, align: "left", spacing: 1 });
          ty += capH;
        }
        for (const l of labelLines) {
          ty += fs * LH.item;
          ops.push({ t: "text", x: tx, y: ty - fs * 0.3, text: l, font: "sans", size: fs, fill: COLORS.night, align: "left", spacing: 0 });
        }
        y += h + s.itemGap * k;
      });
      y -= s.itemGap * k;
    }
    return { ops, end: y };
  };

  // Zmenšuj, dokud se obsah nevejde (dlouhé volby, dlouhé jméno momentu).
  let k = 1;
  let res = build(k);
  while (res.end > s.bottom && k > 0.55) {
    k -= 0.05;
    res = build(k);
  }

  const ops: DrawOp[] = [{ t: "rect", x: 0, y: 0, w: W, h: H, fill: COLORS.night }, { t: "flag", ...s.flag }];
  ops.push({ t: "text", x: s.brand.x, y: s.brand.y, text: card.brand, font: "wide", size: s.brand.size, fill: COLORS.onNight, align: s.brand.align, spacing: 0 });
  if (card.name) {
    const nameMax = format === "square" ? W - s.pad - (s.flag.x + s.flag.w + s.flag.w / 6) : maxW;
    const [nm] = wrapText(card.name, nameMax, (x) => measure(x, "sans", s.name.size, 0), 1);
    ops.push({ t: "text", x: s.name.x, y: s.name.y, text: nm ?? card.name, font: "sans", size: s.name.size, fill: COLORS.onNight, align: s.name.align, spacing: 0 });
  }
  return [...ops, ...res.ops];
}

/* ---------------- Online demonstrace (SPEC-demonstrace §8) ---------------- */

interface DemoSpec {
  pad: number;
  flag: { x: number; y: number; w: number };
  /** Textový sloupec: začátek, šířka. */
  text: { x: number; y: number; w: number; bottom: number };
  scene: Box;
  brand: { x: number; y: number; size: number; align: "left" | "right" };
  name: { x: number; y: number; size: number; align: "left" | "right" };
  kicker: number;
  headline: number;
  line: number;
}

const DEMO_SPECS: Record<ClientFormat, DemoSpec> = {
  story: {
    pad: 88,
    flag: { x: 88, y: 160, w: 300 },
    text: { x: 88, y: 470, w: 1080 - 176, bottom: 960 },
    scene: { x: 40, y: 980, w: 1000, h: 720 },
    brand: { x: 88, y: 1920 - 110, size: 40, align: "left" },
    name: { x: 1080 - 88, y: 1920 - 110, size: 36, align: "right" },
    kicker: 30,
    headline: 88,
    line: 48,
  },
  square: {
    pad: 72,
    flag: { x: 72, y: 72, w: 168 },
    text: { x: 72, y: 300, w: 460, bottom: 930 },
    scene: { x: 560, y: 200, w: 500, h: 840 },
    brand: { x: 72, y: 1080 - 72, size: 28, align: "left" },
    name: { x: 1080 - 72, y: 112, size: 28, align: "right" },
    kicker: 22,
    headline: 56,
    line: 34,
  },
};

/** Story a čtverec pro demonstraci: text, pod ním (story) nebo vedle (čtverec) dav s panáčkem. */
export function layoutDemoCard(card: ShareCard, format: ClientFormat, measure: Measure): DrawOp[] {
  const s = DEMO_SPECS[format];
  const { width: W, height: H } = FORMATS[format];
  const ops: DrawOp[] = [{ t: "rect", x: 0, y: 0, w: W, h: H, fill: COLORS.night }];
  if (card.figure) for (const p of demoScene(card.figure, s.scene)) ops.push({ t: "stickman", ...p });
  ops.push({ t: "flag", ...s.flag });

  const build = (k: number) => {
    const out: DrawOp[] = [];
    let y = s.text.y;
    const text = (t: string, font: FontKind, size: number, lh: number, fill: string, spacing: number, maxLines: number) => {
      for (const line of wrapText(t, s.text.w, (x) => measure(x, font, size, spacing), maxLines)) {
        y += size * lh;
        out.push({ t: "text", x: s.text.x, y: y - size * (lh - 1) - size * 0.18, text: line, font, size, fill, align: "left", spacing });
      }
    };
    if (card.kicker) {
      text(card.kicker, "wide", s.kicker * k, LH.kicker, COLORS.nightAccent, 3 * k, 2);
      y += 12 * k;
    }
    text(card.headline, "wide", s.headline * k, LH.headline, COLORS.onNight, -2 * k, 6);
    if (card.line) {
      y += 28 * k;
      text(card.line, "wide", s.line * k, LH.line, COLORS.onNight, 0, 2);
    }
    return { out, end: y };
  };
  let k = 1;
  let res = build(k);
  while (res.end > s.text.bottom && k > 0.55) {
    k -= 0.05;
    res = build(k);
  }
  ops.push(...res.out);
  ops.push({ t: "text", x: s.brand.x, y: s.brand.y, text: card.brand, font: "wide", size: s.brand.size, fill: COLORS.onNight, align: s.brand.align, spacing: 0 });
  if (card.name) {
    const [nm] = wrapText(card.name, W / 2 - s.pad, (x) => measure(x, "sans", s.name.size, 0), 1);
    ops.push({ t: "text", x: s.name.x, y: s.name.y, text: nm ?? card.name, font: "sans", size: s.name.size, fill: COLORS.onNight, align: s.name.align, spacing: 0 });
  }
  return ops;
}
