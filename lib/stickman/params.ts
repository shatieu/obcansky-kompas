import { POSES, SIGN_COLORS, type Pose, type SignColor } from "@/lib/demo/constants";
import { mulberry32, pick, range } from "./prng";

export { POSES, SIGN_COLORS, type Pose, type SignColor };

export const HAIR_STYLES = ["none", "short", "long", "ponytail", "cap", "baseball", "beanie"] as const;
/** Vlasy nebo pokrývka hlavy: žádné, krátké, delší, culík, čepice, kšiltovka, kulich (SPEC-demonstrace §5.1). */
export type Hair = (typeof HAIR_STYLES)[number];

export const SIGN_SHAPES = ["rect", "banner", "small"] as const;
/** Obdélník, transparent na dvou tyčích, malá cedulka. */
export type SignShape = (typeof SIGN_SHAPES)[number];

/** Parametry panáčka (všechny proměnné z §5.1). Stejný seed = stejné parametry všude. */
export interface StickmanParams {
  seed: number;
  /** Výška, násobek (±12 %). */
  height: number;
  /** Velikost hlavy, násobek poloměru. */
  headSize: number;
  armLength: number;
  legLength: number;
  shoulderWidth: number;
  /** Mírný předklon/záklon trupu ve stupních (v čelním pohledu jako náklon). */
  lean: number;
  /** Sklon hlavy ve stupních. */
  headTilt: number;
  hair: Hair;
  glasses: boolean;
  /** Šála v trikolóře (malá šance). Je to šála, ne vlajka. */
  scarf: boolean;
  signShape: SignShape;
  /** Rychlost animace (±20 %). */
  speed: number;
  /** Fáze animace 0–1. */
  phase: number;
}

/** Rozsahy proměnných – sdílené s rozvržením davu (meze výšky hlavy). */
export const RANGES = {
  height: [0.88, 1.12],
  headSize: [0.9, 1.15],
  armLength: [0.9, 1.1],
  legLength: [0.92, 1.08],
  shoulderWidth: [0.85, 1.2],
  lean: [-4, 4],
  headTilt: [-8, 8],
  speed: [0.8, 1.2],
} as const;

/** Šance na šálu v trikolóře. */
export const SCARF_CHANCE = 0.08;
export const GLASSES_CHANCE = 0.22;

/** Čistá deterministická funkce: seed (32bit uint) → parametry panáčka. */
export function generateStickman(seed: number): StickmanParams {
  const s = seed >>> 0;
  const rnd = mulberry32(s);
  const r = (k: keyof typeof RANGES) => range(rnd, RANGES[k][0], RANGES[k][1]);
  // Pořadí volání rnd() je součást formátu – neměnit (stejný seed musí dát stejného panáčka).
  const height = r("height");
  const headSize = r("headSize");
  const armLength = r("armLength");
  const legLength = r("legLength");
  const shoulderWidth = r("shoulderWidth");
  const lean = r("lean");
  const headTilt = r("headTilt");
  const hair = pick(rnd, HAIR_STYLES, [16, 26, 16, 10, 8, 12, 12]);
  const glasses = rnd() < GLASSES_CHANCE;
  const scarf = rnd() < SCARF_CHANCE;
  const signShape = pick(rnd, SIGN_SHAPES, [55, 20, 25]);
  const speed = r("speed");
  const phase = rnd();
  return { seed: s, height, headSize, armLength, legLength, shoulderWidth, lean, headTilt, hair, glasses, scarf, signShape, speed, phase };
}

export const isPose = (v: unknown): v is Pose => typeof v === "string" && (POSES as readonly string[]).includes(v);
export const isSignColor = (v: unknown): v is SignColor => typeof v === "string" && (SIGN_COLORS as readonly string[]).includes(v);
