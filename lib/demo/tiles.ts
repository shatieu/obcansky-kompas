import type postgres from "postgres";
import {
  TILE_SIZE,
  type MetaResponse,
  type ModerationStatus,
  type PersonResponse,
  type Pose,
  type SignColor,
  type TileItem,
} from "./constants";

/**
 * Čtení davu z DB a tvar dlaždic (SPEC-demonstrace §6.4). Do dlaždic a veřejných odpovědí se
 * vlastní slogan a jméno dostanou JEN ve stavu `approved` a bez `hidden_at`; jinak výchozí
 * předvolba a bez jména. Tahle funkce je jediná brána – testy hlídají, že nic jiného neprosákne.
 */

export interface DemoRow {
  id: string;
  position_index: number;
  seed: number | string;
  pose: Pose;
  sign_color: SignColor;
  slogan_preset_id: string | null;
  slogan_custom: string | null;
  slogan_status: ModerationStatus;
  first_name: string | null;
  name_status: ModerationStatus;
  hidden_at: Date | string | null;
  created_at: Date | string;
}

const pragueDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD v pražském čase. */
export const joinedDay = (d: Date | string) => pragueDay.format(new Date(d));

export interface ShapeOpts {
  defaultPresetId: string;
  isPresetId: (id: string) => boolean;
}

/** Veřejný slogan: "t:<schválený text>" nebo "p:<předvolba>". */
export function publicSlogan(r: Pick<DemoRow, "slogan_preset_id" | "slogan_custom" | "slogan_status" | "hidden_at">, o: ShapeOpts): string {
  if (r.slogan_custom && r.slogan_status === "approved" && !r.hidden_at) return `t:${r.slogan_custom}`;
  if (!r.slogan_custom && r.slogan_preset_id && o.isPresetId(r.slogan_preset_id)) return `p:${r.slogan_preset_id}`;
  return `p:${o.defaultPresetId}`;
}

export function publicName(r: Pick<DemoRow, "first_name" | "name_status" | "hidden_at">): string | null {
  return r.first_name && r.name_status === "approved" && !r.hidden_at ? r.first_name : null;
}

export function shapeTileItem(r: DemoRow, o: ShapeOpts): TileItem {
  return [r.position_index, Number(r.seed), r.pose, r.sign_color, publicSlogan(r, o), publicName(r), r.id, joinedDay(r.created_at)];
}

export function shapePerson(r: DemoRow, o: ShapeOpts): PersonResponse {
  return {
    id: r.id,
    index: r.position_index,
    seed: Number(r.seed),
    pose: r.pose,
    signColor: r.sign_color,
    slogan: publicSlogan(r, o),
    name: publicName(r),
    joinedDay: joinedDay(r.created_at),
  };
}

const COLS = "id, position_index, seed, pose, sign_color, slogan_preset_id, slogan_custom, slogan_status, first_name, name_status, hidden_at, created_at";

export async function queryTileRows(sql: postgres.Sql, n: number, includeSeed: boolean): Promise<DemoRow[]> {
  const lo = n * TILE_SIZE;
  const hi = lo + TILE_SIZE;
  return sql.unsafe<DemoRow[]>(
    `select ${COLS} from app.demonstrator
     where position_index >= $1 and position_index < $2 ${includeSeed ? "" : "and not is_seed"}
     order by position_index`,
    [lo, hi],
  );
}

export async function queryPersonRow(sql: postgres.Sql, id: string, includeSeed: boolean): Promise<DemoRow | null> {
  const rows = await sql.unsafe<DemoRow[]>(
    `select ${COLS} from app.demonstrator where id = $1 ${includeSeed ? "" : "and not is_seed"}`,
    [id],
  );
  return rows[0] ?? null;
}

/** Počet účastníků a dlaždic. Dlaždice se počítají z nejvyššího indexu (mezery po odvolání zůstávají). */
export async function queryMeta(sql: postgres.Sql, includeSeed: boolean): Promise<Omit<MetaResponse, "demo">> {
  const [row] = await sql.unsafe<{ n: number; max: number | null }[]>(
    `select count(*)::int as n, max(position_index) as max from app.demonstrator ${includeSeed ? "" : "where not is_seed"}`,
  );
  const max = row?.max;
  return { count: row?.n ?? 0, tiles: max === null || max === undefined ? 0 : Math.floor(Number(max) / TILE_SIZE) + 1, tileSize: TILE_SIZE };
}

export interface OwnRow {
  slogan_preset_id: string | null;
  slogan_custom: string | null;
  slogan_status: ModerationStatus;
  first_name: string | null;
  name_status: ModerationStatus;
  reroll_count: number;
}

/** Soukromá část karty jen pro vlastníka (štítek „Čeká na kontrolu“ / „Text neprošel kontrolou“). */
export async function queryOwn(sql: postgres.Sql, id: string, signatureId: string): Promise<PersonResponse["own"] | null> {
  const [r] = await sql<OwnRow[]>`
    select slogan_preset_id, slogan_custom, slogan_status, first_name, name_status, reroll_count
    from app.demonstrator where id = ${id} and signature_id = ${signatureId}`;
  if (!r) return null;
  return {
    sloganPresetId: r.slogan_preset_id,
    sloganCustom: r.slogan_custom,
    sloganStatus: r.slogan_status,
    firstName: r.first_name,
    nameStatus: r.name_status,
    rerollCount: r.reroll_count,
  };
}
