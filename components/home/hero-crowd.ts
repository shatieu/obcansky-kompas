import { figureGeometry, figureSvg, generateStickman, PALETTE_CSS, POSES, poseAt, STROKE, type Figure, type Pose, type SignColor } from "@/lib/stickman";
import { hasSign } from "@/lib/demo/constants";

/**
 * Ilustrace online demonstrace v hero hlavní stránky: malá vzdušná skupinka panáčků z generátoru
 * (lib/stickman), cedule bez textu. Čistá funkce bez DOM – vykreslí se na serveru jako statické SVG,
 * na klienta nejde žádný JS. Pevné seedy = stejný obrázek při každém požadavku.
 *
 * Barvy: čáry v --ink, cedule jen bílé a modré (PALETTE_CSS). Červená na obrazovce patří vlajce
 * (pravidla: nejvýš jeden červený prvek), proto žádné červené cedule ani šály v trikolóře.
 *
 * Klíče nad hlavou (1989, zvonění klíči): dokud generátor nemá pózu `klice`, kreslí se svazek
 * klíčů tady do zdvižené ruky. Jakmile `klice` v POSES je a poseAt ji umí, použije se automaticky její
 * postoj; svazek klíčů je v hero vždy vlastní, větší (generátorový je dělaný pro malé postavy v davu).
 */

/** Póza „klíče nad hlavou“ z generátoru, pokud už existuje. */
const KEYS_POSE = (POSES as readonly string[]).includes("klice") ? ("klice" as Pose) : null;

interface Spot {
  /** Seed z generateStickman (bez šály – ta má červený pruh). */
  seed: number;
  pose: Pose;
  sign: SignColor;
  /** Střed chodidel ve světových jednotkách ilustrace. */
  x: number;
  /** 0 = zadní řada (menší, výš), 1 = přední. */
  row: 0 | 1;
  /** Snímek animace v ms – staticky, ale ne všichni ve stejné fázi. */
  t: number;
  /** Zvedá klíče: L = levá ruka (místo pěsti), R = pravá. */
  keys?: "L" | "R";
}

/** Výřez ilustrace (jednotky) – poměr ≈ 2 : 1, aby na mobilu (328 px) měla ≈ 160 px a na desktopu (440 px) ≈ 215 px. */
export const HERO_CROWD_VIEWBOX = { x: 6, y: 38, w: 358, h: 176 } as const;

const ROW = [
  { y: 172, scale: 0.8 },
  { y: 206, scale: 0.94 },
] as const;

/** Zadní řada drží cedule nad hlavou (silueta demonstrace), přední je smíšená a s volnými rukama. */
const SPOTS: readonly Spot[] = [
  { seed: 1183412200, pose: "drzi", sign: "blue", x: 58, row: 0, t: 300 },
  { seed: 3746424094, pose: "mava", sign: "white", x: 144, row: 0, t: 420 },
  { seed: 4225124878, pose: "skace", sign: "white", x: 228, row: 0, t: 0 },
  { seed: 1810039509, pose: "drzi", sign: "blue", x: 310, row: 0, t: 900 },

  { seed: 3598497569, pose: "skace", sign: "none", x: 26, row: 1, t: 200, keys: "L" },
  { seed: 169507974, pose: "tleska", sign: "blue", x: 100, row: 1, t: 380 },
  { seed: 3211220652, pose: "mava", sign: "none", x: 184, row: 1, t: 450 },
  { seed: 3507073702, pose: "pest", sign: "none", x: 262, row: 1, t: 600, keys: "L" },
  { seed: 2971870260, pose: "drzi", sign: "none", x: 336, row: 1, t: 500 },
];

const n = (v: number) => String(Math.round(v * 100) / 100);

/**
 * Svazek klíčů zdvižený v ruce (ruka = konec předloktí): kroužek a tři klíče vějířem nahoru,
 * čáry v --ink tenčí než tělo, ostré konce jako zbytek panáčka.
 */
function keysSvg(fig: Figure, hand: "L" | "R"): string {
  const arm = fig.body[hand === "L" ? 8 : 10]!;
  const k = fig.scale;
  const ring = { x: arm.x2, y: arm.y2 - 4 * k, r: 4.4 * k };
  const out = [`<g style="fill:none;stroke:var(--ink);stroke-width:${n(STROKE * 0.6)};stroke-linecap:square">`];
  out.push(`<circle cx="${n(ring.x)}" cy="${n(ring.y)}" r="${n(ring.r)}"/>`);
  for (const deg of [148, 180, 212]) {
    const a = (deg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    const x0 = ring.x + dx * ring.r;
    const y0 = ring.y + dy * ring.r;
    const len = 14 * k;
    const x1 = x0 + dx * len;
    const y1 = y0 + dy * len;
    // Dřík + dva zuby kolmo k němu.
    const px = dy * 3.6 * k;
    const py = -dx * 3.6 * k;
    const t1 = { x: x0 + dx * len * 0.7, y: y0 + dy * len * 0.7 };
    out.push(
      `<path d="M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}M${n(x1)} ${n(y1)}l${n(px)} ${n(py)}M${n(t1.x)} ${n(t1.y)}l${n(px)} ${n(py)}"/>`,
    );
  }
  out.push(`</g>`);
  return out.join("");
}

/** Vnitřek <svg> (skupiny panáčků), zadní řada první, aby ji přední řada překryla. */
export function heroCrowdSvg(): string {
  const out: string[] = [];
  for (const s of [...SPOTS].sort((a, b) => a.row - b.row)) {
    const params = generateStickman(s.seed);
    const sign = hasSign(s.sign);
    const opts = { signColor: s.sign, signText: "", palette: PALETTE_CSS, signShape: params.signShape };
    // Póza `klice` z generátoru, když ji poseAt umí (jinak póza ze SPOTS bez pěsti).
    const keysAngles = s.keys && KEYS_POSE ? (poseAt(params, KEYS_POSE, s.t, sign) as ReturnType<typeof poseAt> | undefined) : undefined;
    let fig: Figure;
    let body: string;
    let hand: "L" | "R" | null = null;
    if (keysAngles) {
      // Svazek generátoru je stavěný pro dav (malý); v hero by byl jen tečkou, proto se kreslí
      // větší vlastní svazek do stejné (levé) ruky a ten z generátoru se vynechá.
      fig = { ...figureGeometry(params, keysAngles), keys: null } as Figure;
      body = figureSvg(fig, opts);
      hand = "L";
    } else {
      const geo = figureGeometry(params, poseAt(params, s.pose, s.t, sign));
      // Klíče místo pěsti: pěst (čtverec) by se se svazkem slila.
      fig = s.keys ? { ...geo, fist: null } : geo;
      body = figureSvg(fig, opts);
      hand = s.keys ?? null;
    }
    const r = ROW[s.row];
    out.push(`<g transform="translate(${n(s.x)} ${n(r.y)}) scale(${r.scale})">`);
    out.push(body);
    if (hand) out.push(keysSvg(fig, hand));
    out.push(`</g>`);
  }
  return out.join("");
}

/** Počet postav a jejich seedy (testy). */
export const HERO_CROWD_SIZE = SPOTS.length;
export const HERO_CROWD_SEEDS = SPOTS.map((s) => s.seed);
