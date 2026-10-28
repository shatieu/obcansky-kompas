import { RANGES, type Hair, type SignShape, type StickmanParams } from "./params";

/**
 * Kostra a geometrie panáčka v jednotkách „světa“: postava výšky 1 měří ~100 jednotek,
 * chodidla stojí na y = 0, osa y míří dolů (jako SVG). Ze stejné geometrie kreslí SVG
 * (náhled, sdílecí obrázky), canvas (atlas siluet) i PixiJS (dav).
 */

/** Jednotná tloušťka čar (ostré konce, square caps). */
export const STROKE = 3;

export const BODY = {
  headR: 8,
  neck: 3,
  torso: 30,
  upperArm: 15,
  forearm: 15,
  thigh: 21,
  shin: 21,
  shoulderHalf: 6,
  /** Tyčky cedule nad rukama (obě ruce nad hlavou). */
  poleTwo: 12,
  /** Tyč cedule v jedné ruce (musí dostat ceduli nad hlavu). */
  poleOne: 28,
  /** Tyč cedule opřené o zem. */
  poleGround: 30,
  /** Velikost pěsti (čtverec). */
  fist: 6,
} as const;

export const SIGN_SIZE: Record<SignShape, { w: number; h: number }> = {
  rect: { w: 56, h: 38 },
  banner: { w: 84, h: 26 },
  small: { w: 34, h: 24 },
};

/** Výřez SVG – stejný pro všechny pózy, aby animace neposkakovala. */
export const VIEWBOX = { x: -90, y: -192, w: 180, h: 200 } as const;

/** Meze pro rozvržení davu: výška středu hlavy v klidovém postoji a největší poloměr hlavy (×1, bez měřítka řady). */
export const HEAD_LIMITS = (() => {
  const [hMin, hMax] = RANGES.height;
  const [lMin, lMax] = RANGES.legLength;
  const [sMin, sMax] = RANGES.headSize;
  const leanCos = Math.cos((Math.abs(RANGES.lean[0]) * Math.PI) / 180);
  // Nohy v klidu mohou být mírně pokrčené (skok v bodě 0): faktor 0,95.
  const centerMin = ((BODY.thigh + BODY.shin) * lMin * 0.95 + (BODY.torso + BODY.neck) * leanCos + BODY.headR * sMin * 0.95) * hMin;
  const centerMax = ((BODY.thigh + BODY.shin) * lMax + BODY.torso + BODY.neck + BODY.headR * sMax) * hMax;
  return { centerMin, centerMax, rMax: BODY.headR * sMax * hMax };
})();

/** two = obě ruce nad hlavou, one = jedna ruka, ground = opřená o zem, none = bez cedule. */
export type SignMode = "two" | "one" | "ground" | "none";

/** Úhly kloubů ve stupních. 0 = svisle dolů, 90 = doprava, 180 = nahoru, −90 = doleva (obrazovka). */
export interface PoseAngles {
  /** Náklon trupu (přičte se k params.lean). */
  lean: number;
  /** Sklon hlavy (přičte se k params.headTilt). */
  head: number;
  /** [rameno → loket, loket → ruka] absolutní úhly; L = levá strana obrazovky. */
  armL: [number, number];
  armR: [number, number];
  /** [kyčel → koleno, koleno → chodidlo]. */
  legL: [number, number];
  legR: [number, number];
  /** Zvednutí celé postavy (skok), jednotky. */
  lift: number;
  sign: { mode: SignMode; angle: number };
  /** Zdvižená pěst na levé ruce. */
  fist: boolean;
  /** Svazek klíčů v levé ruce (póza „klice“): natočení svazku ve stupních (cinkání). */
  keys?: number;
}

export interface Pt {
  x: number;
  y: number;
}
export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Figure {
  /** Tělo v pořadí: nohy, trup, krk, ramena, paže (vždy 11 úseček). */
  body: Seg[];
  /** Tyče cedule (0–2). */
  poles: Seg[];
  head: { x: number; y: number; r: number; angle: number };
  /** Střed cedule, rozměry a natočení (stupně, po směru hodin); null = panáček bez cedule. */
  sign: { x: number; y: number; w: number; h: number; angle: number } | null;
  scarf: { x: number; y: number; angle: number; half: number } | null;
  fist: { x: number; y: number; size: number } | null;
  /** Svazek klíčů v levé ruce: kroužek v (x, y), visí dolů natočený o `angle`; tvar KEYS_PATH × scale. */
  keys: { x: number; y: number; angle: number } | null;
  hair: Hair;
  glasses: boolean;
  /** Měřítko postavy (= params.height) – pro tloušťku detailů. */
  scale: number;
}

/**
 * Svazek klíčů (jednotky při měřítku 1, počátek = střed kroužku, klíče visí dolů): kroužek r 2,6
 * a tři klíče do vějíře (dřík + zuby). Stejné úsečky pro SVG i canvas, čáry v --ink.
 */
export const KEYS_RING_R = 2.6;
export const KEYS_SEGS: readonly Seg[] = (() => {
  const out: Seg[] = [];
  for (const [deg, len] of [[-24, 10], [0, 12], [22, 9]] as const) {
    const c = Math.cos((deg * Math.PI) / 180);
    const sn = Math.sin((deg * Math.PI) / 180);
    // lokální osa klíče: od kroužku dolů, otočená o deg
    const P = (x: number, y: number): Pt => ({ x: Math.round((x * c - y * sn) * 100) / 100, y: Math.round((x * sn + y * c) * 100) / 100 });
    const y0 = KEYS_RING_R;
    const sg = (a: Pt, b: Pt): Seg => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    out.push(sg(P(0, y0), P(0, y0 + len)), sg(P(0, y0 + len - 1), P(2.6, y0 + len - 1)), sg(P(0, y0 + len - 3.6), P(1.8, y0 + len - 3.6)));
  }
  return out;
})();
export const KEYS_PATH = KEYS_SEGS.map((g) => `M${g.x1} ${g.y1}L${g.x2} ${g.y2}`).join("");
/** Šířka čar klíčů (jednotky). */
export const KEYS_STROKE = 1.4;

const RAD = Math.PI / 180;
const dir = (deg: number): Pt => ({ x: Math.sin(deg * RAD), y: Math.cos(deg * RAD) });
const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
/** Otočení vektoru po směru hodin (y dolů). */
const rot = (v: Pt, deg: number): Pt => {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};
const seg = (a: Pt, b: Pt): Seg => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });

/** Dopředná kinematika: parametry + úhly → úsečky, hlava, cedule. */
export function figureGeometry(p: StickmanParams, a: PoseAngles): Figure {
  const s = p.height;
  const thigh = BODY.thigh * p.legLength * s;
  const shin = BODY.shin * p.legLength * s;
  const upper = BODY.upperArm * p.armLength * s;
  const fore = BODY.forearm * p.armLength * s;
  const torso = BODY.torso * s;
  const neckLen = BODY.neck * s;
  const headR = BODY.headR * p.headSize * s;
  const sh = BODY.shoulderHalf * p.shoulderWidth * s;

  const hip0: Pt = { x: 0, y: 0 };
  const kneeL0 = add(hip0, dir(a.legL[0]), thigh);
  const footL0 = add(kneeL0, dir(a.legL[1]), shin);
  const kneeR0 = add(hip0, dir(a.legR[0]), thigh);
  const footR0 = add(kneeR0, dir(a.legR[1]), shin);
  // Nižší chodidlo stojí na zemi (y = 0), skok zvedne celou postavu.
  const dy = -Math.max(footL0.y, footR0.y) - a.lift * s;
  const sh0 = (q: Pt): Pt => ({ x: q.x, y: q.y + dy });
  const hip = sh0(hip0);
  const kneeL = sh0(kneeL0);
  const footL = sh0(footL0);
  const kneeR = sh0(kneeR0);
  const footR = sh0(footR0);

  const lean = p.lean + a.lean;
  const up = dir(180 + lean);
  const right: Pt = { x: -up.y, y: up.x };
  const neck = add(hip, up, torso);
  const shoulderL = add(neck, right, -sh);
  const shoulderR = add(neck, right, sh);
  const neckTop = add(neck, up, neckLen);
  const headAngle = lean + p.headTilt + a.head;
  const headC = add(neckTop, dir(180 + headAngle), headR);

  const elbowL = add(shoulderL, dir(a.armL[0]), upper);
  const handL = add(elbowL, dir(a.armL[1]), fore);
  const elbowR = add(shoulderR, dir(a.armR[0]), upper);
  const handR = add(elbowR, dir(a.armR[1]), fore);

  const body = [
    seg(hip, kneeL),
    seg(kneeL, footL),
    seg(hip, kneeR),
    seg(kneeR, footR),
    seg(hip, neck),
    seg(neck, neckTop),
    seg(shoulderL, shoulderR),
    seg(shoulderL, elbowL),
    seg(elbowL, handL),
    seg(shoulderR, elbowR),
    seg(elbowR, handR),
  ];

  const rest = {
    head: { x: headC.x, y: headC.y, r: headR, angle: headAngle },
    scarf: p.scarf ? { x: neck.x, y: neck.y, angle: lean, half: sh } : null,
    fist: a.fist ? { x: handL.x, y: handL.y, size: BODY.fist * s } : null,
    keys: a.keys !== undefined ? { x: handL.x, y: handL.y - 2 * s, angle: a.keys } : null,
    hair: p.hair,
    glasses: p.glasses,
    scale: s,
  };
  if (a.sign.mode === "none") return { body, poles: [], sign: null, ...rest };

  // Cedule
  const size = SIGN_SIZE[p.signShape];
  const w = size.w * s;
  const h = size.h * s;
  const ang = a.sign.angle;
  const banner = p.signShape === "banner";
  const inset = 8 * s;
  const poles: Seg[] = [];
  let bottom: Pt;
  if (a.sign.mode === "ground") {
    const base: Pt = { x: hip.x + 30 * s, y: 0 };
    bottom = add(base, rot({ x: 0, y: -BODY.poleGround * s }, ang));
    if (banner) {
      for (const k of [-1, 1]) {
        const top = add(bottom, rot({ x: k * (w / 2 - inset), y: 0 }, ang));
        poles.push(seg(add(top, rot({ x: 0, y: BODY.poleGround * s }, ang)), top));
      }
    } else poles.push(seg(base, bottom));
  } else {
    const two = a.sign.mode === "two";
    // Obě ruce: drží spodní hranu cedule krátkými tyčkami (transparent dvěma tyčemi).
    // Jedna ruka: cedule na jedné tyči (transparent: dvě tyče z jedné ruky do V).
    const grip: Pt = two ? { x: (handL.x + handR.x) / 2, y: (handL.y + handR.y) / 2 } : handR;
    const poleLen = (two ? BODY.poleTwo : BODY.poleOne) * s;
    bottom = add(grip, rot({ x: 0, y: -poleLen }, ang));
    if (two) {
      const spread = Math.hypot(handR.x - handL.x, handR.y - handL.y) / 2;
      const d = banner ? w / 2 - inset : Math.min(w / 2 - 4 * s, Math.max(spread, 6 * s));
      poles.push(seg(handL, add(bottom, rot({ x: -d, y: 0 }, ang))), seg(handR, add(bottom, rot({ x: d, y: 0 }, ang))));
    } else if (banner) {
      for (const k of [-1, 1]) poles.push(seg(grip, add(bottom, rot({ x: k * (w / 2 - inset), y: 0 }, ang))));
    } else {
      // Tyč kousek přesahuje pod úchop.
      poles.push(seg(add(grip, rot({ x: 0, y: 5 * s }, ang)), bottom));
    }
  }
  const center = add(bottom, rot({ x: 0, y: -h / 2 }, ang));

  return { body, poles, sign: { x: center.x, y: center.y, w, h, angle: ang }, ...rest };
}

/**
 * Vlasy a pokrývky hlavy jako SVG cesty v souřadnicích hlavy s poloměrem 8 (střed 0,0).
 * `fill` = plná plocha v --ink, jinak tah. Sdílí SVG i canvas (Path2D).
 */
export const HAIR_PATHS: Record<Hair, { d: string; fill: boolean }[]> = {
  none: [],
  short: [{ d: "M-9.5 -1.5 A9.5 9.5 0 0 1 9.5 -1.5 L7 -4.5 L-7 -4.5 Z", fill: true }],
  long: [
    { d: "M-9.5 -1.5 A9.5 9.5 0 0 1 9.5 -1.5 L7 -4.5 L-7 -4.5 Z", fill: true },
    { d: "M-9.5 -2 L-10.5 11 M9.5 -2 L10.5 11", fill: false },
  ],
  ponytail: [
    { d: "M-9.5 -1.5 A9.5 9.5 0 0 1 9.5 -1.5 L7 -4.5 L-7 -4.5 Z", fill: true },
    { d: "M7 -6 L14 -4 L15 5", fill: false },
  ],
  cap: [{ d: "M-10 -3 L10 -3 L8 -11 L-8 -11 Z", fill: true }],
  baseball: [
    { d: "M-9 -2.5 A9 9 0 0 1 9 -2.5 Z", fill: true },
    { d: "M8 -3.5 L16 -3.5", fill: false },
  ],
  beanie: [
    { d: "M-9.5 -1 A9.5 9.5 0 0 1 9.5 -1 Z", fill: true },
    { d: "M-2 -14.5 h4 v4 h-4 Z", fill: true },
  ],
};

/** Brýle: dvě hranatá skla a můstek (souřadnice hlavy s poloměrem 8). */
export const GLASSES_PATH = "M-6.5 0 h4.5 v3 h-4.5 Z M2 0 h4.5 v3 h-4.5 Z M-2 1 h4";

/** Šála v trikolóře: pruh přes krk a jeden visící konec. Je to šála, ne vlajka. */
export function scarfShapes(sc: NonNullable<Figure["scarf"]>, scale: number) {
  const bandW = sc.half * 2 + 4 * scale;
  const bandH = 4.5 * scale;
  const tailW = 4.5 * scale;
  const tailH = 12 * scale;
  return {
    band: { x: -bandW / 2, y: -bandH / 2 + 1.5 * scale, w: bandW, h: bandH },
    tail: { x: sc.half - tailW - 1 * scale, y: bandH / 2 + 1.5 * scale, w: tailW, h: tailH },
  };
}
