/**
 * Sdílené konstanty online demonstrace (SPEC-demonstrace §3, §5.3, §6.4). Čisté – bez Node API,
 * použitelné i v prohlížeči.
 */
export const POSES = ["drzi", "mava", "pochoduje", "tleska", "skace", "pest"] as const;
export type Pose = (typeof POSES)[number];

export const SIGN_COLORS = ["white", "blue", "red"] as const;
export type SignColor = (typeof SIGN_COLORS)[number];

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
export const CACHE_FULL_TILE = "public, s-maxage=86400, stale-while-revalidate=604800";
export const CACHE_LAST_TILE = "public, s-maxage=30, stale-while-revalidate=120";
export const CACHE_META = "public, s-maxage=30, stale-while-revalidate=120";
export const CACHE_PERSON = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * Položka dlaždice: [index, seed, pose, signColor, slogan, name, id, joinedDay].
 * slogan = "p:<preset id>" nebo "t:<schválený vlastní text>"; joinedDay = YYYY-MM-DD (Europe/Prague).
 */
export type TileItem = [number, number, Pose, SignColor, string, string | null, string, string];

export interface TileResponse {
  n: number;
  items: TileItem[];
}

export interface MetaResponse {
  count: number;
  tiles: number;
  tileSize: number;
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
  own?: {
    sloganCustom: string | null;
    sloganStatus: ModerationStatus;
    sloganPresetId: string | null;
    firstName: string | null;
    nameStatus: ModerationStatus;
    rerollCount: number;
  };
}
