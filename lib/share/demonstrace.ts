import { POSES, SIGN_COLORS, type Pose, type SignColor } from "@/lib/demo/constants";
import { hash32, mulberry32 } from "@/lib/stickman/prng";
import type { StickmanPalette } from "@/lib/stickman/sign";
import { VIEWBOX } from "@/lib/stickman/geometry";
import type { CrowdFigure, ShareCard, ShareFigure } from "./card";
import { plural, shareSentence } from "./moments";
import { COLORS } from "./style";

/**
 * Sdílecí moment „demonstrace“ (SPEC-demonstrace §8): panáček s cedulí v popředí, za ním výřez
 * davu, počet účastníků. Čisté funkce, stejné rozmístění pro OG (server) i Story/čtverec (canvas).
 * Na obrázku jen schválený text (nebo předvolba) a jméno se souhlasem – to zaručí volající
 * (veřejná data z lib/demo: publicSlogan/publicName).
 */
export interface DemoImageTexts {
  brand: string;
  demo_kicker: string;
  demo_count_one: string;
  demo_count_few: string;
  demo_count_many: string;
}

const NB = " ";
export const formatCount = (n: number) => String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, NB);

export function demoCountLine(count: number, img: DemoImageTexts): string {
  const tpl = plural(count, [img.demo_count_one, img.demo_count_few, img.demo_count_many]);
  // Číslo a slovo za ním drží pohromadě („2 481 lidí“).
  return tpl.replace(/\{count\} /, `${formatCount(count)}${NB}`).replace("{count}", formatCount(count));
}

export interface DemoPersonInput {
  seed: number;
  pose: Pose;
  signColor: SignColor;
  /** Text cedule – schválený vlastní slogan, nebo předvolba. */
  signText: string;
  /** Jméno jen schválené (se souhlasem), jinak null. */
  name: string | null;
  /** Sousedé v davu (nepovinné). */
  crowd?: CrowdFigure[];
}

export function demonstraceCard(p: DemoPersonInput, count: number | null, img: DemoImageTexts): ShareCard {
  return {
    moment: "demonstrace",
    brand: img.brand,
    kicker: img.demo_kicker,
    headline: shareSentence("demonstrace"),
    big: null,
    line: count && count > 0 ? demoCountLine(count, img) : null,
    items: [],
    numbered: false,
    name: p.name,
    figure: { seed: p.seed >>> 0, pose: p.pose, signColor: p.signColor, signText: p.signText, crowd: (p.crowd ?? []).slice(0, CROWD_MAX) },
  };
}

/* ---------------- Scéna: dav + panáček ---------------- */

/** Barvy na noční ploše: panáček bílými čarami, cedule v barvách vlajky. */
export const FG_PALETTE: StickmanPalette = {
  ink: COLORS.onNight,
  surface: COLORS.night,
  signFill: { white: COLORS.flagWhite, blue: COLORS.flagBlue, red: COLORS.flagRed },
  signText: { white: COLORS.night, blue: COLORS.flagWhite, red: COLORS.flagWhite },
  tricolor: { white: COLORS.flagWhite, red: COLORS.flagRed, blue: COLORS.flagBlue },
};

/** Dav za panáčkem: tlumené čáry a cedule bez textu, aby popředí vyniklo. */
export const CROWD_PALETTE: StickmanPalette = {
  ink: "#4D6A93",
  surface: COLORS.night,
  signFill: { white: "#2B4466", blue: "#1C3760", red: "#3A3550" },
  signText: { white: COLORS.night, blue: COLORS.night, red: COLORS.night },
  tricolor: { white: "#4D6A93", red: "#4D6A93", blue: "#4D6A93" },
};

export interface Placed {
  seed: number;
  pose: Pose;
  signColor: SignColor;
  /** Prázdný = cedule bez textu (dav). */
  signText: string;
  /** Chodidla v px. */
  x: number;
  y: number;
  /** px na jednotku postavy. */
  scale: number;
  layer: "crowd" | "fg";
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Řady davu: hloubka (0 = vzadu), výška chodidel (podíl boxu), měřítko vůči popředí, počet. */
const ROWS = [
  { feet: 0.5, k: 0.3, n: 7 },
  { feet: 0.64, k: 0.38, n: 6 },
  { feet: 0.8, k: 0.48, n: 5 },
] as const;
export const CROWD_MAX = ROWS.reduce((a, r) => a + r.n, 0);

/** Sousedé ze seedu, když skutečná data davu nejsou k dispozici. */
export function syntheticCrowd(seed: number, n = CROWD_MAX): CrowdFigure[] {
  const rnd = mulberry32(hash32(seed ^ 0x5eed));
  return Array.from({ length: n }, (_, i) => ({
    seed: hash32((seed + i * 2654435761) >>> 0),
    pose: POSES[Math.floor(rnd() * POSES.length)]!,
    signColor: SIGN_COLORS[Math.floor(rnd() * SIGN_COLORS.length)]!,
  }));
}

/**
 * Rozmístění scény do boxu: dav ve třech řadách (vzadu menší a výš), panáček uprostřed dole.
 * Pořadí = pořadí kreslení (zadní řady dřív, popředí naposled). Deterministické podle seedu.
 */
export function demoScene(fig: ShareFigure, box: Box): Placed[] {
  const fgScale = Math.min((box.h * 0.98) / VIEWBOX.h, (box.w * 0.9) / VIEWBOX.w);
  const crowd = [...fig.crowd, ...syntheticCrowd(fig.seed)].slice(0, CROWD_MAX);
  const rnd = mulberry32(hash32(fig.seed ^ 0xc0ffee));
  const out: Placed[] = [];
  let i = 0;
  ROWS.forEach((row, r) => {
    const scale = fgScale * row.k;
    const step = box.w / row.n;
    for (let j = 0; j < row.n; j++) {
      const c = crowd[i++]!;
      const offset = r % 2 ? 0.25 : 0.5;
      const jitter = (rnd() - 0.5) * step * 0.3;
      out.push({ ...c, signText: "", x: box.x + step * (j + offset) + jitter, y: box.y + box.h * row.feet, scale, layer: "crowd" });
    }
  });
  out.push({
    seed: fig.seed,
    pose: fig.pose,
    signColor: fig.signColor,
    signText: fig.signText,
    x: box.x + box.w / 2,
    y: box.y + box.h * 0.96,
    scale: fgScale,
    layer: "fg",
  });
  return out;
}

/** Sousedé z dlaždice davu: nejbližší indexy kolem panáčka (bez něj). */
export function neighborsFromTile(items: readonly (readonly [number, number, string, string, ...unknown[]])[], index: number, n = CROWD_MAX): CrowdFigure[] {
  return items
    .filter((it) => it[0] !== index)
    .sort((a, b) => Math.abs(a[0] - index) - Math.abs(b[0] - index) || a[0] - b[0])
    .slice(0, n)
    .map((it) => ({
      seed: Number(it[1]) >>> 0,
      pose: (POSES as readonly string[]).includes(it[2]) ? (it[2] as Pose) : POSES[0],
      signColor: (SIGN_COLORS as readonly string[]).includes(it[3]) ? (it[3] as SignColor) : SIGN_COLORS[0],
    }));
}
