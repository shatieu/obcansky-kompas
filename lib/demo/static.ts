import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { MetaResponse, PersonResponse, TileResponse } from "./constants";

/**
 * STATIC_DEMO=1 (SPEC-demonstrace §9): dav ze statického exportu seedu
 * (content/generated/demonstrace-tiles/*.json, píše `pnpm seed:demonstrace`). Připojení je vypnuté.
 */
const DIR = path.join(process.cwd(), "content", "generated", "demonstrace-tiles");

function readJsonFile<T>(file: string): T | null {
  const p = path.join(DIR, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

export function staticMeta(): MetaResponse {
  return readJsonFile<MetaResponse>("meta.json") ?? { count: 0, tiles: 0, tileSize: 1000, demo: true };
}

export function staticTile(n: number): TileResponse {
  return readJsonFile<TileResponse>(`${n}.json`) ?? { n, items: [] };
}

export function staticPerson(id: string): PersonResponse | null {
  const meta = staticMeta();
  for (let n = 0; n < meta.tiles; n++) {
    const item = staticTile(n).items.find((it) => it[6] === id);
    if (item) {
      const [index, seed, pose, signColor, slogan, name, , joinedDay] = item;
      return { id, index, seed, pose, signColor, slogan, name, joinedDay };
    }
  }
  return null;
}
