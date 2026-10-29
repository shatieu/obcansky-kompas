import { POSES, TILE_SIZE, type MetaResponse, type PersonResponse, type Pose, type PublicTileItem, type PublicTileResponse, type SignColor } from "@/lib/demo/constants";
import { encodeCell } from "@/lib/demo/overview";
import { generateStickman } from "@/lib/stickman/params";
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
  /** Veřejné id (uuid) – dlaždice API ho nenesou (null); karta ho dotáhne přes personAt(index). */
  id: string | null;
  /** YYYY-MM-DD */
  joinedDay: string;
}

export interface CrowdMeta {
  count: number;
  tiles: number;
  tileSize: number;
  /** Nejnižší / nejvyšší position_index (indexy mají mezery a nemusí začínat 0). */
  minIndex: number | null;
  maxIndex: number | null;
  demo: boolean;
}

export function personFromItem(it: PublicTileItem): CrowdPerson {
  return {
    index: it[0],
    seed: it[1] >>> 0,
    pose: isPose(it[2]) ? it[2] : "drzi",
    signColor: isSignColor(it[3]) ? it[3] : "white",
    slogan: typeof it[4] === "string" ? it[4] : "",
    name: it[5] ?? null,
    id: null,
    joinedDay: String(it[6] ?? ""),
  };
}

export function personFromResponse(r: PersonResponse): CrowdPerson {
  return { ...personFromItem([r.index, r.seed, r.pose, r.signColor, r.slogan, r.name, r.joinedDay]), id: String(r.id) };
}

/** Text sloganu k zobrazení: předvolba podle id, nebo schválený vlastní text; "" = bez sloganu. */
export function sloganText(slogan: string, presets: Record<string, string>, fallbackId: string): string {
  if (!slogan) return "";
  if (slogan.startsWith("t:")) return slogan.slice(2);
  const id = slogan.startsWith("p:") ? slogan.slice(2) : slogan;
  return presets[id] ?? presets[fallbackId] ?? "";
}

export interface CrowdSource {
  meta(): Promise<CrowdMeta>;
  tile(n: number): Promise<CrowdPerson[]>;
  /** Přehledová dlaždice: 1 bajt na index (lib/demo/overview) – siluety vzdáleného pohledu. */
  overview(n: number): Promise<Uint8Array>;
  /** Osoba (s id) podle position_index – karta po klepnutí. */
  personAt(index: number): Promise<CrowdPerson | null>;
  person(id: string): Promise<CrowdPerson | null>;
  me(): Promise<{ id: string; index: number } | null>;
  /** Nahlášení s jednorázovým tokenem Turnstile (bez tokenu server odmítne). */
  report(id: string, turnstileToken: string): Promise<boolean>;
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
      const maxIndex = typeof m.maxIndex === "number" ? m.maxIndex : m.count > 0 ? m.count - 1 : null;
      const minIndex = typeof m.minIndex === "number" ? m.minIndex : m.count > 0 ? 0 : null;
      return { count: m.count, tiles: m.tiles, tileSize: m.tileSize || TILE_SIZE, minIndex, maxIndex, demo: !!m.demo };
    },
    async tile(n) {
      const t = await getJson<PublicTileResponse>(`${API}/tile/${n}`);
      return t.items.map(personFromItem);
    },
    async overview(n) {
      const res = await fetch(`${API}/overview/${n}`);
      if (!res.ok) throw new HttpError(res.status);
      return new Uint8Array(await res.arrayBuffer());
    },
    async personAt(index) {
      try {
        return personFromResponse(await getJson<PersonResponse>(`${API}/at/${index}`));
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return null;
        throw e;
      }
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
    async report(id, turnstileToken) {
      const res = await fetch(`${API}/${encodeURIComponent(id)}/report`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnstileToken }),
      });
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
    const poses: readonly Pose[] = POSES;
    const colors: SignColor[] = ["white", "blue", "red"];
    const custom = customTexts.length > 0 && rnd() < 0.15;
    // Asi třetina bez cedule (jako seed); vlastní proud, ať zbytek ukázky zůstane stejný.
    const noSign = mulberry32((i * 2654435761) ^ 0x5eed)() < 1 / 3;
    const slogan = custom ? `t:${customTexts[Math.floor(rnd() * customTexts.length)]}` : `p:${presetIds[Math.floor(rnd() * presetIds.length)] ?? ""}`;
    const pose = poses[Math.floor(rnd() * poses.length)]!;
    const paint = colors[Math.floor(rnd() * colors.length)]!;
    const day = new Date(Date.UTC(2026, 9, 1) + Math.floor((i / Math.max(1, count)) * 27) * 86400000);
    return {
      index: i,
      seed,
      pose,
      signColor: noSign ? "none" : paint,
      slogan,
      name: FIXTURE_NAMES[Math.floor(rnd() * FIXTURE_NAMES.length)] ?? null,
      id: `fixture-${i}`,
      joinedDay: day.toISOString().slice(0, 10),
    };
  };
  return {
    fixture: true,
    async meta() {
      return { count, tiles: Math.ceil(count / TILE_SIZE), tileSize: TILE_SIZE, minIndex: count ? 0 : null, maxIndex: count ? count - 1 : null, demo: true };
    },
    async tile(n) {
      const out: CrowdPerson[] = [];
      for (let i = n * TILE_SIZE; i < Math.min(count, (n + 1) * TILE_SIZE); i++) out.push(person(i));
      return out;
    },
    async overview(n) {
      const len = Math.max(0, Math.min(TILE_SIZE, count - n * TILE_SIZE));
      const out = new Uint8Array(len);
      for (let k = 0; k < len; k++) {
        const p = person(n * TILE_SIZE + k);
        out[k] = encodeCell(p.pose, p.signColor, generateStickman(p.seed).signShape);
      }
      return out;
    },
    async personAt(index) {
      return index >= 0 && index < count ? person(index) : null;
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
