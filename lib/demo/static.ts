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
  const m = readJsonFile<Partial<MetaResponse>>("meta.json");
  if (!m) return { count: 0, tiles: 0, tileSize: 1000, minIndex: null, maxIndex: null, demo: true };
  return {
    count: m.count ?? 0,
    tiles: m.tiles ?? 0,
    tileSize: m.tileSize ?? 1000,
    minIndex: m.minIndex ?? (m.count ? 0 : null),
    maxIndex: m.maxIndex ?? (m.count ? m.count - 1 : null),
    demo: m.demo ?? true,
  };
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
