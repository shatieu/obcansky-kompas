import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type postgres from "postgres";
import { CONTENT_VERSION } from "@/lib/content";
import { mulberry32, SEED_EPOCH } from "@/lib/seed/generate";
import { POSES, SIGN_COLORS, TILE_SIZE, U32_MAX, type MetaResponse, type Pose, type SignColor, type TileResponse } from "./constants";
import type { DemoSlogansFile } from "./slogans-schema";
import { shapeTileItem, type DemoRow } from "./tiles";

/**
 * Ukázkový dav (SPEC-demonstrace §9): deterministický – stejný počet = stejní panáčci se stejnými
 * id, takže statický export pro STATIC_DEMO sedí s tím, co `pnpm seed:demonstrace` zapíše do DB.
 * Všechny pózy a barvy, předvolby, pár desítek vlastních neutrálních sloganů, fiktivní křestní jména.
 */

export const DEMO_SEED = 20261029;
export const DEMO_SEED_COUNT = 500;
export const STATIC_DIR = path.join(process.cwd(), "content", "generated", "demonstrace-tiles");

const FIRST_NAMES = [
  "Jana", "Eva", "Lucie", "Tereza", "Kateřina", "Petra", "Lenka", "Hana", "Veronika", "Anna", "Marie", "Klára",
  "Jan", "Petr", "Tomáš", "Martin", "Jakub", "Lukáš", "Ondřej", "Pavel", "Jiří", "Michal", "Vojtěch", "Karel",
  "Zuzana", "Barbora", "Adéla", "Filip", "Matěj", "Adam", "Šimon", "Radka", "Dana", "Věra",
];

export interface SeedDemonstrator {
  id: string;
  seed: number;
  pose: Pose;
  signColor: SignColor;
  sloganPresetId: string | null;
  sloganCustom: string | null;
  firstName: string | null;
  rerollCount: number;
  createdAt: string;
}

function uuidFrom(rng: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(rng() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * Čas připojení nezávislý na počtu (prvních 500 je pak stejných i ve velkém seedu): prvních 500
 * rovnoměrně 4 týdny před SEED_EPOCH, další po 30 s od SEED_EPOCH (50 000 ≈ 17 dní).
 */
function joinedAt(i: number): number {
  const span = 28 * 24 * 3600 * 1000;
  if (i < DEMO_SEED_COUNT) return SEED_EPOCH - span + Math.floor((span * i) / DEMO_SEED_COUNT);
  return SEED_EPOCH + (i - DEMO_SEED_COUNT) * 30_000;
}

export function generateDemoSeed(count: number, slogans: DemoSlogansFile): SeedDemonstrator[] {
  const rng = mulberry32(DEMO_SEED);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
  const out: SeedDemonstrator[] = [];
  for (let i = 0; i < count; i++) {
    const custom = rng() < 0.12;
    out.push({
      id: uuidFrom(rng),
      seed: Math.floor(rng() * (U32_MAX + 1)),
      // Pózy a barvy cyklicky + náhodně: každá kombinace se v prvních desítkách objeví.
      pose: i < POSES.length * SIGN_COLORS.length ? POSES[i % POSES.length]! : pick(POSES),
      signColor: i < POSES.length * SIGN_COLORS.length ? SIGN_COLORS[Math.floor(i / POSES.length)]! : pick(SIGN_COLORS),
      sloganPresetId: custom ? null : pick(slogans.presets).id,
      sloganCustom: custom ? pick(slogans.custom_seed_examples) : null,
      firstName: rng() < 0.45 ? pick(FIRST_NAMES) : null,
      rerollCount: Math.floor(rng() * 4),
      createdAt: new Date(joinedAt(i)).toISOString(),
    });
  }
  return out;
}

/** Statický export pro STATIC_DEMO=1: dlaždice <n>.json + meta.json (index = pořadí v seedu). */
export function writeStaticExport(items: SeedDemonstrator[], slogans: DemoSlogansFile, dir = STATIC_DIR): { tiles: number } {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.endsWith(".json")) rmSync(path.join(dir, f));
  const opts = { defaultPresetId: slogans.default, isPresetId: (id: string) => slogans.presets.some((p) => p.id === id) };
  const tiles = Math.ceil(items.length / TILE_SIZE);
  for (let n = 0; n < tiles; n++) {
    const tile: TileResponse = {
      n,
      items: items.slice(n * TILE_SIZE, (n + 1) * TILE_SIZE).map((s, k) => shapeTileItem(toRow(s, n * TILE_SIZE + k), opts)),
    };
    writeFileSync(path.join(dir, `${n}.json`), JSON.stringify(tile) + "\n", "utf8");
  }
  const meta: MetaResponse = { count: items.length, tiles, tileSize: TILE_SIZE, demo: true };
  writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta) + "\n", "utf8");
  return { tiles };
}

function toRow(s: SeedDemonstrator, index: number): DemoRow {
  return {
    id: s.id,
    position_index: index,
    seed: s.seed,
    pose: s.pose,
    sign_color: s.signColor,
    slogan_preset_id: s.sloganPresetId,
    slogan_custom: s.sloganCustom,
    slogan_status: s.sloganCustom ? "approved" : "none",
    first_name: s.firstName,
    name_status: s.firstName ? "approved" : "none",
    hidden_at: null,
    created_at: s.createdAt,
  };
}

type Sql = postgres.Sql | postgres.TransactionSql;

/** Smaže ukázkové panáčky; když je pak tabulka prázdná, vrátí sekvenci pořadí na 0. */
export async function clearDemoSeed(sql: Sql): Promise<number> {
  const r = await sql`delete from app.demonstrator where is_seed`;
  await resetPositionIfEmpty(sql);
  return r.count;
}

export async function resetPositionIfEmpty(sql: Sql): Promise<void> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from app.demonstrator`;
  if (row!.n === 0) await sql`select setval('app.demonstrator_position_seq', 0, false)`;
}

/**
 * Zapíše ukázkový dav: každý panáček na jeden seedový podpis (nejdřív stávající seedové podpisy
 * podle data, chybějící se dovytvoří – jen s odpověďmi, bez osobních údajů). Idempotentní.
 */
export async function insertDemoSeed(sql: postgres.Sql, items: SeedDemonstrator[]): Promise<{ inserted: number; extraSignatures: number }> {
  return sql.begin(async (tx) => {
    await clearDemoSeed(tx);
    const sigs = await tx<{ id: string; answers: unknown }[]>`
      select id, answers from app.signature where is_seed and withdrawn_at is null order by created_at, id`;
    if (!sigs.length) throw new Error("Žádné seedové podpisy – nejdřív `pnpm seed`.");
    const ids = sigs.map((s) => s.id);
    let extra = 0;
    const CHUNK = 1000;
    for (let i = ids.length; i < items.length; i += CHUNK) {
      const n = Math.min(CHUNK, items.length - i);
      const rows = Array.from({ length: n }, (_, k) => ({
        answers: tx.json(sigs[(i + k) % sigs.length]!.answers as postgres.JSONValue),
        content_version: CONTENT_VERSION,
        verification_level: "email",
        verified_at: items[i + k]!.createdAt,
        is_seed: true,
        is_poc: false,
        created_at: items[i + k]!.createdAt,
      }));
      const made = await tx<{ id: string }[]>`insert into app.signature ${tx(rows)} returning id`;
      ids.push(...made.map((m) => m.id));
      extra += made.length;
    }
    for (let i = 0; i < items.length; i += CHUNK) {
      const rows = items.slice(i, i + CHUNK).map((s, k) => ({
        id: s.id,
        signature_id: ids[i + k]!,
        seed: s.seed,
        pose: s.pose,
        sign_color: s.signColor,
        slogan_preset_id: s.sloganPresetId,
        slogan_custom: s.sloganCustom,
        slogan_status: s.sloganCustom ? "approved" : "none",
        first_name: s.firstName,
        name_status: s.firstName ? "approved" : "none",
        consent_at: s.createdAt,
        reroll_count: s.rerollCount,
        created_at: s.createdAt,
        updated_at: s.createdAt,
        is_seed: true,
        is_poc: false,
      }));
      await tx`insert into app.demonstrator ${tx(rows)}`;
    }
    return { inserted: items.length, extraSignatures: extra };
  });
}
