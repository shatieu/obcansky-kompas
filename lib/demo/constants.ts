/**
 * Sdílené konstanty online demonstrace (SPEC-demonstrace §3, §5.3, §6.4). Čisté – bez Node API,
 * použitelné i v prohlížeči.
 */
/** Pózy; `klice` = zvoní klíči nad hlavou (gesto listopadu 1989). */
export const POSES = ["drzi", "mava", "pochoduje", "tleska", "skace", "pest", "klice"] as const;
export type Pose = (typeof POSES)[number];

/** Barvy cedule. `none` = panáček bez cedule (volné ruce, slogan nepovinný). */
export const SIGN_COLORS = ["white", "blue", "red", "none"] as const;
export type SignColor = (typeof SIGN_COLORS)[number];
/** Skutečné barvy cedule (bez `none`) – palety, atlas cedulí. */
export const SIGN_PAINTS = ["white", "blue", "red"] as const;
export type SignPaint = (typeof SIGN_PAINTS)[number];
export const hasSign = (c: SignColor): c is SignPaint => c !== "none";

export const MODERATION_STATUSES = ["none", "pending", "approved", "rejected"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export type ModerationField = "slogan" | "name";

/** Dlaždice davu = 1 000 účastníků podle position_index (§6.4). */
export const TILE_SIZE = 1000;
/** Max. změn vzhledu („Jiný panáček“), pak zůstane poslední (§3.4). */
export const MAX_REROLLS = 20;
export const SLOGAN_MAX = 40;
export const NAME_MAX = 20;
/** Po kolika nahlášeních od různých IP se vlastní text a jméno skryjí (§4.3). */
export const REPORT_HIDE_THRESHOLD = 3;
export const U32_MAX = 0xffffffff;

/** Hláška při zamítnutí skriptovou moderací – doslova SPEC-demonstrace §4.1. */
export const MODERATION_REJECT_MESSAGE = "Tento text nelze použít. Zkuste jiný.";

export const tileOf = (index: number) => Math.floor(index / TILE_SIZE);
export const tileTag = (n: number) => `demo-tile:${n}`;
export const personTag = (id: string) => `demo-person:${id}`;
export const META_TAG = "demo-meta";

/** Hlavičky cache (§6.4). */
/**
 * Plná dlaždice (právě 1 000 řádků): SPEC chtěla s-maxage=86400, ale čištění CDN tagem
 * (lib/demo/cache.ts → dangerouslyDeleteByTag) není na produkci ověřené – do ověření kratší
 * platnost, aby skrytý/odvolaný text nevydržel v CDN déle než ~15 min (DECISIONS).
 */
export const CACHE_FULL_TILE = "public, s-maxage=300, stale-while-revalidate=600";
export const CACHE_LAST_TILE = "public, s-maxage=30, stale-while-revalidate=120";
export const CACHE_META = "public, s-maxage=30, stale-while-revalidate=120";
export const CACHE_PERSON = "public, s-maxage=60, stale-while-revalidate=120";

/**
 * Položka dlaždice na serveru (data cache, seznam, statický export): [index, seed, pose, signColor, slogan, name, id, joinedDay].
 * slogan = "p:<preset id>", "t:<schválený vlastní text>", nebo "" (panáček bez cedule bez sloganu); joinedDay = YYYY-MM-DD (Europe/Prague).
 */
export type TileItem = [number, number, Pose, SignColor, string, string | null, string, string];

export interface TileResponse {
  n: number;
  items: TileItem[];
}

/**
 * Položka dlaždice v API (GET /tile/[n]) – bez id (uuid, ~40 % velikosti): [index, seed, pose, signColor, slogan, name, joinedDay].
 * Id k kartě (sdílení, nahlášení) dá GET /api/demonstrace/at/[index].
 */
export type PublicTileItem = [number, number, Pose, SignColor, string, string | null, string];

export interface PublicTileResponse {
  n: number;
  items: PublicTileItem[];
}

export const publicTileItem = (it: TileItem): PublicTileItem => [it[0], it[1], it[2], it[3], it[4], it[5], it[7]];

/** Přehledová dlaždice (GET /overview/[n]): 1 bajt na index, jen vzhled (lib/demo/overview). */
export const overviewTag = (n: number) => `demo-overview:${n}`;
/**
 * Plná přehledová dlaždice: jen póza/barva/tvar cedule a obsazenost (žádný text), čistí ji připojení,
 * úprava i odvolání tagem `demo-overview:<n>` – proto dlouhá platnost (požadavek vlastníka na egress).
 */
export const CACHE_OVERVIEW_FULL = "public, s-maxage=86400, stale-while-revalidate=604800";

export interface MetaResponse {
  count: number;
  tiles: number;
  tileSize: number;
  /** Nejnižší a nejvyšší position_index (null = prázdný dav). Indexy mají mezery a nemusí začínat 0. */
  minIndex: number | null;
  maxIndex: number | null;
  demo: boolean;
}

export interface PersonResponse {
  id: string;
  index: number;
  seed: number;
  pose: Pose;
  signColor: SignColor;
  slogan: string;
  name: string | null;
  joinedDay: string;
}

/** Soukromá data vlastníka (vlastní text a jeho stav) – jen GET /api/demonstrace/me/detail. */
export interface OwnDetail {
  sloganCustom: string | null;
  sloganStatus: ModerationStatus;
  sloganPresetId: string | null;
  firstName: string | null;
  nameStatus: ModerationStatus;
  rerollCount: number;
  /** Skryto po nahlášení do ruční kontroly – veřejně předvolba a bez jména, autor vidí svůj text. */
  hidden: boolean;
}

/** GET /api/demonstrace/me/detail – vlastní panáček podle cookie ok_owner (private, no-store). */
export interface OwnDetailResponse {
  id: string;
  index: number;
  seed: number;
  pose: Pose;
  signColor: SignColor;
  own: OwnDetail;
}
