import { TILE_SIZE, type MetaResponse, type PersonResponse, type Pose, type SignColor, type TileItem, type TileResponse } from "@/lib/demo/constants";
import { isPose, isSignColor } from "@/lib/stickman/params";
import { mulberry32 } from "@/lib/stickman/prng";

/**
 * Data davu pro klienta. API (§6.4): /api/demonstrace/meta, /tile/[n], /[id], /me, /[id]/report.
 * Dokud API neexistuje (404) a nejde o produkci, použije se deterministická ukázka (fixtures).
 */
export interface CrowdPerson {
  index: number;
  seed: number;
  pose: Pose;
  signColor: SignColor;
  /** "p:<preset id>" nebo "t:<schválený text>". */
  slogan: string;
  name: string | null;
  id: string;
  /** YYYY-MM-DD */
  joinedDay: string;
}

export interface CrowdMeta {
  count: number;
  tiles: number;
  tileSize: number;
  demo: boolean;
}

export function personFromItem(it: TileItem): CrowdPerson {
  return {
    index: it[0],
    seed: it[1] >>> 0,
    pose: isPose(it[2]) ? it[2] : "drzi",
    signColor: isSignColor(it[3]) ? it[3] : "white",
    slogan: typeof it[4] === "string" ? it[4] : "",
    name: it[5] ?? null,
    id: String(it[6]),
    joinedDay: String(it[7] ?? ""),
  };
}

export function personFromResponse(r: PersonResponse): CrowdPerson {
  return personFromItem([r.index, r.seed, r.pose, r.signColor, r.slogan, r.name, r.id, r.joinedDay]);
}

/** Text sloganu k zobrazení: předvolba podle id, nebo schválený vlastní text. */
export function sloganText(slogan: string, presets: Record<string, string>, fallbackId: string): string {
  if (slogan.startsWith("t:")) return slogan.slice(2);
  const id = slogan.startsWith("p:") ? slogan.slice(2) : slogan;
  return presets[id] ?? presets[fallbackId] ?? "";
}

export interface CrowdSource {
  meta(): Promise<CrowdMeta>;
  tile(n: number): Promise<CrowdPerson[]>;
  person(id: string): Promise<CrowdPerson | null>;
  me(): Promise<{ id: string; index: number } | null>;
  report(id: string): Promise<boolean>;
  readonly fixture: boolean;
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as T;
}

export const API = "/api/demonstrace";

export function httpSource(): CrowdSource {
  return {
    fixture: false,
    async meta() {
      const m = await getJson<MetaResponse>(`${API}/meta`);
      return { count: m.count, tiles: m.tiles, tileSize: m.tileSize || TILE_SIZE, demo: !!m.demo };
    },
    async tile(n) {
      const t = await getJson<TileResponse>(`${API}/tile/${n}`);
      return t.items.map(personFromItem);
    },
    async person(id) {
      try {
        return personFromResponse(await getJson<PersonResponse>(`${API}/${encodeURIComponent(id)}`));
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return null;
        throw e;
      }
    },
    async me() {
      try {
        const r = await getJson<{ id: string; index: number }>(`${API}/me`, { credentials: "same-origin" });
        return r && typeof r.index === "number" ? r : null;
      } catch {
        return null;
      }
    },
    async report(id) {
      const res = await fetch(`${API}/${encodeURIComponent(id)}/report`, { method: "POST", credentials: "same-origin" });
      return res.ok || res.status === 409;
    },
  };
}

/**
 * Deterministická ukázka davu (jen vývoj a měření výkonu, ?fixture=50000). Ukázková jména
 * a texty jsou testovací data, ne texty webu; v produkci se nepoužije.
 */
const FIXTURE_NAMES = ["Jana", "Petr", "Eva", "Tomáš", "Lucie", "Martin", "Anna", "Jakub", null, null, null, null] as const;
export function fixtureSource(count: number, presetIds: string[], customTexts: string[] = []): CrowdSource {
  const person = (i: number): CrowdPerson => {
    const rnd = mulberry32(i * 2654435761);
    const seed = Math.floor(rnd() * 4294967296) >>> 0;
    const poses: Pose[] = ["drzi", "mava", "pochoduje", "tleska", "skace", "pest"];
    const colors: SignColor[] = ["white", "blue", "red"];
    const custom = customTexts.length > 0 && rnd() < 0.15;
    const slogan = custom ? `t:${customTexts[Math.floor(rnd() * customTexts.length)]}` : `p:${presetIds[Math.floor(rnd() * presetIds.length)] ?? ""}`;
    const day = new Date(Date.UTC(2026, 9, 1) + Math.floor((i / Math.max(1, count)) * 27) * 86400000);
    return {
      index: i,
      seed,
      pose: poses[Math.floor(rnd() * poses.length)]!,
      signColor: colors[Math.floor(rnd() * colors.length)]!,
      slogan,
      name: FIXTURE_NAMES[Math.floor(rnd() * FIXTURE_NAMES.length)] ?? null,
      id: `fixture-${i}`,
      joinedDay: day.toISOString().slice(0, 10),
    };
  };
  return {
    fixture: true,
    async meta() {
      return { count, tiles: Math.ceil(count / TILE_SIZE), tileSize: TILE_SIZE, demo: true };
    },
    async tile(n) {
      const out: CrowdPerson[] = [];
      for (let i = n * TILE_SIZE; i < Math.min(count, (n + 1) * TILE_SIZE); i++) out.push(person(i));
      return out;
    },
    async person(id) {
      const m = /^fixture-(\d+)$/.exec(id);
      if (!m) return null;
      const i = Number(m[1]);
      return i < count ? person(i) : null;
    },
    async me() {
      return null;
    },
    async report() {
      return true;
    },
  };
}
