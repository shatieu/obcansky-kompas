import { unstable_cache } from "next/cache";
import { getSql } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { META_TAG, personTag, TILE_SIZE, tileTag, type MetaResponse, type PersonResponse, type TileResponse } from "./constants";
import { encodeOverview } from "./overview";
import { DEFAULT_PRESET_ID, isPresetId } from "./slogans";
import { staticMeta, staticPerson, staticTile } from "./static";
import { queryMeta, queryPersonRow, queryTileRows, shapePerson, shapeTileItem } from "./tiles";

/**
 * Cachované čtení davu pro route handlery a stránky (SPEC-demonstrace §6.4). Data cache s tagy
 * `demo-tile:<n>`, `demo-meta`, `demo-person:<id>`; zápisy je zneplatní (lib/demo/cache.ts).
 * Seedoví účastníci jen s DEMO_MODE=1 (jako u statistik); STATIC_DEMO=1 čte statický export.
 */
const shapeOpts = { defaultPresetId: DEFAULT_PRESET_ID, isPresetId };
const includeSeed = () => flags.demoMode();

export async function loadMeta(): Promise<MetaResponse> {
  if (flags.staticDemo()) return staticMeta();
  const seed = includeSeed();
  const m = await unstable_cache(() => queryMeta(getSql(), seed), ["demo-meta", String(seed)], {
    tags: [META_TAG],
    revalidate: 30,
  })();
  return { ...m, demo: flags.showDemoBar() };
}

/**
 * `last` = poslední (rostoucí) dlaždice → krátká platnost; ostatní drží do zneplatnění tagem, nejdéle
 * 10 min (pojistka pro zásahy z CLI bez vzdálené revalidace).
 */
export async function loadTile(n: number, last: boolean): Promise<TileResponse> {
  if (flags.staticDemo()) return staticTile(n);
  const seed = includeSeed();
  return unstable_cache(
    async () => ({ n, items: (await queryTileRows(getSql(), n, seed)).map((r) => shapeTileItem(r, shapeOpts)) }),
    ["demo-tile", String(n), String(seed), last ? "last" : "full"],
    { tags: [tileTag(n)], revalidate: last ? 30 : 600 },
  )();
}

/**
 * Přehledová dlaždice (1 B na index) z téže data cache jako plná dlaždice – DB se kvůli ní nečte
 * (lib/demo/overview); kódování je levné (seed → tvar cedule).
 */
export async function loadOverview(n: number, last: boolean): Promise<Uint8Array> {
  const tile = await loadTile(n, last);
  return encodeOverview(n, tile.items);
}

/**
 * Osoba podle position_index (karta po klepnutí – dlaždice API id nenesou). Z data cache dlaždice,
 * takže ani CDN miss nesahá do DB častěji než dlaždice. null = na indexu nikdo není.
 */
export async function loadPersonAt(index: number): Promise<PersonResponse | null> {
  const meta = await loadMeta();
  const n = Math.floor(index / TILE_SIZE);
  if (n >= meta.tiles) return null;
  const it = (await loadTile(n, n >= meta.tiles - 1)).items.find((x) => x[0] === index);
  if (!it) return null;
  const [i, seed, pose, signColor, slogan, name, id, joinedDay] = it;
  return { id, index: i, seed, pose, signColor, slogan, name, joinedDay };
}

export async function loadPerson(id: string): Promise<PersonResponse | null> {
  if (flags.staticDemo()) return staticPerson(id);
  const seed = includeSeed();
  return unstable_cache(
    async () => {
      const row = await queryPersonRow(getSql(), id, seed);
      return row ? shapePerson(row, shapeOpts) : null;
    },
    ["demo-person", id, String(seed)],
    { tags: [personTag(id)], revalidate: 600 },
  )();
}
