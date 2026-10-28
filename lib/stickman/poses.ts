import type { PoseAngles } from "./geometry";
import type { Pose, StickmanParams } from "./params";

/**
 * Pózy (SPEC-demonstrace §5.3) jako úhly kloubů v čase. Smyčka 1,2–2,4 s, rychlost (±20 %)
 * a fáze ze seedu, aby dav nebyl synchronní.
 */

/** Základní délka smyčky pózy v ms (před vydělením rychlostí). */
export const POSE_PERIOD: Record<Pose, number> = {
  drzi: 2000,
  mava: 1800,
  pochoduje: 1500,
  tleska: 1600,
  skace: 1600,
  pest: 1800,
  klice: 1400,
};
export const LOOP_MIN = 1200;
export const LOOP_MAX = 2400;

/** Délka smyčky konkrétního panáčka v ms (vždy v 1,2–2,4 s). */
export function loopMs(params: StickmanParams, pose: Pose): number {
  return Math.min(LOOP_MAX, Math.max(LOOP_MIN, POSE_PERIOD[pose] / params.speed));
}

const TAU = Math.PI * 2;
const REST_LEGS = { legL: [-6, -3] as [number, number], legR: [6, 3] as [number, number] };

function overhead(params: StickmanParams): { armL: [number, number]; armR: [number, number] } {
  // Lokty do stran, předloktí nahoru: ruce drží spodní hranu cedule nad hlavou.
  return params.signShape === "banner"
    ? { armL: [-128, -172], armR: [128, 172] }
    : params.signShape === "small"
      ? { armL: [-140, 158], armR: [140, -158] }
      : { armL: [-134, 166], armR: [134, -166] };
}

/** Pozice ve smyčce 0–1 pro čas t (ms). */
export function cycle(params: StickmanParams, pose: Pose, tMs: number): number {
  const v = tMs / loopMs(params, pose) + params.phase;
  return v - Math.floor(v);
}

/**
 * Úhly kloubů pro pózu v čase `tMs`. `tMs = undefined` = klidová póza (prefers-reduced-motion,
 * statické siluety): smyčka v bodě 0 bez fáze, aby všichni stáli stejně klidně.
 * `withSign = false` = panáček bez cedule: stejný pohyb těla, ale volné ruce (freeHands).
 */
export function poseAt(params: StickmanParams, pose: Pose, tMs?: number, withSign = true): PoseAngles {
  const p = tMs === undefined ? 0 : cycle(params, pose, tMs);
  if (!withSign) return freeHands(pose, p);
  const w = Math.sin(TAU * p);
  switch (pose) {
    case "drzi": {
      // Cedule nad hlavou, mírné pohupování v kolenou.
      const b = (1 - Math.cos(2 * TAU * p)) / 2;
      const o = overhead(params);
      return {
        lean: 2 * w,
        head: 0,
        ...o,
        legL: [-6 - 4 * b, -2 + 4 * b],
        legR: [6 + 4 * b, 2 - 4 * b],
        lift: 0,
        sign: { mode: "two", angle: 3 * w },
        fist: false,
      };
    }
    case "mava": {
      // Cedule ze strany na stranu: obě paže se otáčejí v ramenou.
      const sw = 18 * w;
      const o = overhead(params);
      return {
        lean: -3 * w,
        head: -2 * w,
        armL: [o.armL[0] + sw, o.armL[1] + sw],
        armR: [o.armR[0] + sw, o.armR[1] + sw],
        ...REST_LEGS,
        lift: 0,
        sign: { mode: "two", angle: sw * 0.9 },
        fist: false,
      };
    }
    case "pochoduje": {
      // Kroky na místě, cedule na rameni.
      const upL = Math.max(0, w);
      const upR = Math.max(0, -w);
      return {
        lean: 1.5 * w,
        head: 0,
        armL: [-14 + 14 * w, -10 + 22 * w],
        armR: [25, 165],
        legL: [-6 - 40 * upL, -4 + 45 * upL],
        legR: [6 + 40 * upR, 4 - 45 * upR],
        lift: 0,
        sign: { mode: "one", angle: 22 + 2 * w },
        fist: false,
      };
    }
    case "tleska": {
      // Ruce před tělem, cedule opřená o nohu. Dvě tlesknutí na smyčku.
      const c = (1 - Math.cos(2 * TAU * p)) / 2;
      return {
        lean: 0,
        head: 3 * Math.sin(2 * TAU * p),
        armL: [-28 - 8 * c, 112 + 30 * c],
        armR: [28 + 8 * c, -112 - 30 * c],
        ...REST_LEGS,
        lift: 0,
        sign: { mode: "ground", angle: -9 },
        fist: false,
      };
    }
    case "skace": {
      // Malé poskoky (dva na smyčku), cedule nad hlavou.
      const hop = Math.abs(w);
      const bend = 1 - hop;
      const o = overhead(params);
      return {
        lean: 0,
        head: 0,
        armL: [o.armL[0] - 6 * hop, o.armL[1]],
        armR: [o.armR[0] + 6 * hop, o.armR[1]],
        legL: [-6 - 14 * bend, -3 + 9 * bend],
        legR: [6 + 14 * bend, 3 - 9 * bend],
        lift: 9 * hop,
        sign: { mode: "two", angle: 0 },
        fist: false,
      };
    }
    case "pest": {
      // Jedna ruka nahoře v pěst, druhá drží ceduli.
      return {
        lean: -1.5 * w,
        head: 0,
        armL: [-172 + 6 * w, -178 + 8 * w],
        armR: [40, 160],
        ...REST_LEGS,
        lift: 0,
        sign: { mode: "one", angle: 12 + 3 * w },
        fist: true,
      };
    }
    case "klice": {
      // Zvoní klíči (listopad 1989): levá ruka vysoko se svazkem klíčů, zápěstí třese (3× za
      // smyčku), pravá drží ceduli na jedné tyči.
      const j = Math.sin(3 * TAU * p);
      return {
        lean: -1 * w,
        head: -2,
        armL: [-168 + 3 * j, -176 + 9 * j],
        armR: [40, 160],
        ...REST_LEGS,
        lift: 0,
        sign: { mode: "one", angle: 10 + 2 * w },
        fist: false,
        keys: 26 * j,
      };
    }
  }
}

const NO_SIGN = { mode: "none", angle: 0 } as const;

/**
 * Pózy bez cedule – ruce musí vypadat přirozeně: drží → ruce nahoře (jásá), mává → mává rukou,
 * pochoduje → paže se střídavě houpou, tleská → tleská, skáče → ruce nahoře, pěst → zdvižená
 * pěst a druhá ruka dole. Nohy a rytmus stejné jako s cedulí.
 */
function freeHands(pose: Pose, p: number): PoseAngles {
  const w = Math.sin(TAU * p);
  switch (pose) {
    case "drzi": {
      // Jásá: obě ruce nahoře do V, mírné pohupování v kolenou a rukou.
      const b = (1 - Math.cos(2 * TAU * p)) / 2;
      return {
        lean: 2 * w,
        head: 0,
        armL: [-152 + 6 * b, -162 + 8 * b],
        armR: [152 - 6 * b, 162 - 8 * b],
        legL: [-6 - 4 * b, -2 + 4 * b],
        legR: [6 + 4 * b, 2 - 4 * b],
        lift: 0,
        sign: NO_SIGN,
        fist: false,
      };
    }
    case "mava": {
      // Mává pravou rukou: loket do strany nahoru, předloktí se kývá kolem svislice; levá dole.
      return {
        lean: -2 * w,
        head: -2 * w,
        armL: [-12, -6],
        armR: [118, 176 + 28 * w],
        ...REST_LEGS,
        lift: 0,
        sign: NO_SIGN,
        fist: false,
      };
    }
    case "pochoduje": {
      // Kroky na místě, paže se houpou proti sobě.
      const upL = Math.max(0, w);
      const upR = Math.max(0, -w);
      return {
        lean: 1.5 * w,
        head: 0,
        armL: [-14 - 20 * w, -10 - 32 * w],
        armR: [14 - 20 * w, 10 - 32 * w],
        legL: [-6 - 40 * upL, -4 + 45 * upL],
        legR: [6 + 40 * upR, 4 - 45 * upR],
        lift: 0,
        sign: NO_SIGN,
        fist: false,
      };
    }
    case "tleska": {
      // Ruce před tělem, dvě tlesknutí na smyčku (dlaně se potkají na ose).
      const c = (1 - Math.cos(2 * TAU * p)) / 2;
      return {
        lean: 0,
        head: 3 * Math.sin(2 * TAU * p),
        armL: [-28 - 8 * c, 112 + 30 * c],
        armR: [28 + 8 * c, -112 - 30 * c],
        ...REST_LEGS,
        lift: 0,
        sign: NO_SIGN,
        fist: false,
      };
    }
    case "skace": {
      // Malé poskoky s rukama nahoře, při odrazu se ruce víc rozpaží.
      const hop = Math.abs(w);
      const bend = 1 - hop;
      return {
        lean: 0,
        head: 0,
        armL: [-146 - 10 * hop, -160 - 8 * hop],
        armR: [146 + 10 * hop, 160 + 8 * hop],
        legL: [-6 - 14 * bend, -3 + 9 * bend],
        legR: [6 + 14 * bend, 3 - 9 * bend],
        lift: 9 * hop,
        sign: NO_SIGN,
        fist: false,
      };
    }
    case "pest": {
      // Zdvižená pěst vlevo, pravá ruka volně dole.
      return {
        lean: -1.5 * w,
        head: 0,
        armL: [-172 + 6 * w, -178 + 8 * w],
        armR: [10, 4 + 3 * w],
        ...REST_LEGS,
        lift: 0,
        sign: NO_SIGN,
        fist: true,
      };
    }
    case "klice": {
      // Obě ruce nahoře, v levé svazek klíčů, kterým zvoní.
      const j = Math.sin(3 * TAU * p);
      return {
        lean: -1 * w,
        head: -2,
        armL: [-166 + 3 * j, -176 + 9 * j],
        armR: [160 - 2 * w, 170 - 3 * w],
        ...REST_LEGS,
        lift: 0,
        sign: NO_SIGN,
        fist: false,
        keys: 26 * j,
      };
    }
  }
}
