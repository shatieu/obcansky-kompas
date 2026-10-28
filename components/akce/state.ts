import { ADDRESSEE_TYPES, type AddresseeType, type Delka, type Forma } from "@/lib/letters";
import type { DirObec } from "@/lib/export/recipients";

/* ------------------------------------------------- styl v URL (f, d, s) */

export interface StyleParams {
  forma: Forma;
  delka: Delka;
  seed: string;
}

const level = (v: string | null, fallback: 1 | 2 | 3): 1 | 2 | 3 => (v === "1" || v === "2" || v === "3" ? (Number(v) as 1 | 2 | 3) : fallback);
const SEED_RE = /^[a-z0-9]{1,16}$/;

/** Přečte styl z URL. Chybějící seed → null (vygeneruje se a zapíše do URL). */
export function parseStyle(search: URLSearchParams): { forma: Forma; delka: Delka; seed: string | null } {
  const s = search.get("s");
  return { forma: level(search.get("f"), 2), delka: level(search.get("d"), 2), seed: s && SEED_RE.test(s) ? s : null };
}

/** Zapíše styl do URL a zachová ostatní parametry (např. sig). */
export function writeStyle(search: URLSearchParams, style: StyleParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set("f", String(style.forma));
  next.set("d", String(style.delka));
  next.set("s", style.seed);
  return next;
}

/** Nový seed, jiný než `prev`. */
export function newSeed(prev?: string, random: () => number = Math.random): string {
  for (;;) {
    const s = Math.floor(random() * 36 ** 6)
      .toString(36)
      .padStart(6, "0");
    if (s !== prev) return s;
  }
}

/* ------------------------------------- volby adresátů (jen prohlížeč) */

/** Vybraná obec – uložená celá, aby obnovení stránky nemuselo stahovat adresář. */
export type SavedObec = Pick<DirObec, "kod" | "nazev" | "okres" | "kraj_code" | "senatni_obvod" | "urad" | "casti">;

export interface AkcePrefs {
  kraj: string | null;
  obec: SavedObec | null;
  castKod: number | null;
  obvodPick: number | null;
  types: AddresseeType[];
  /** Odškrtnutí poslanci (id osoby); ostatní za kraj jsou vybraní. */
  poslanciOff: number[];
  process: boolean;
  footer: boolean;
  custom: string;
  senderName: string;
  senderAddress: string;
}

export const PREFS_KEY = "obcansky-kompas:akce:v1";
export const CUSTOM_MAX = 300;

export const defaultPrefs = (): AkcePrefs => ({
  kraj: null,
  obec: null,
  castKod: null,
  obvodPick: null,
  types: [],
  poslanciOff: [],
  process: false,
  footer: true,
  custom: "",
  senderName: "",
  senderAddress: "",
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Ověří uložená data (mohou být stará nebo poškozená). */
export function sanitizePrefs(raw: unknown): AkcePrefs {
  const d = defaultPrefs();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const obec = o.obec && typeof o.obec === "object" ? (o.obec as SavedObec) : null;
  return {
    kraj: typeof o.kraj === "string" && /^CZ0\d\d$/.test(o.kraj) ? o.kraj : null,
    obec: obec && typeof obec.kod === "number" && typeof obec.nazev === "string" && Array.isArray(obec.senatni_obvod) ? obec : null,
    castKod: num(o.castKod),
    obvodPick: num(o.obvodPick),
    types: Array.isArray(o.types) ? ADDRESSEE_TYPES.filter((t) => (o.types as unknown[]).includes(t)) : [],
    poslanciOff: Array.isArray(o.poslanciOff) ? o.poslanciOff.filter((x): x is number => typeof x === "number") : [],
    process: o.process === true,
    footer: o.footer !== false,
    custom: str(o.custom, CUSTOM_MAX),
    senderName: str(o.senderName, 120),
    senderAddress: str(o.senderAddress, 200),
  };
}

export function loadPrefs(): AkcePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? sanitizePrefs(JSON.parse(raw)) : defaultPrefs();
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(p: AkcePrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* úložiště nedostupné – funguje dál jen v paměti */
  }
}

/* ------------------------------------------------------- hledání obce */

export const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s-]+/g, " ")
    .trim();

/** Obce podle názvu: nejdřív shoda začátku, pak uvnitř; max. `limit`. */
export function searchObce<T extends { nazev: string }>(list: T[], query: string, limit = 8): T[] {
  const q = normalizeName(query);
  if (!q) return [];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const o of list) {
    const n = normalizeName(o.nazev);
    if (n.startsWith(q)) starts.push(o);
    else if (n.includes(q)) contains.push(o);
  }
  const byLen = (a: T, b: T) => a.nazev.length - b.nazev.length || a.nazev.localeCompare(b.nazev, "cs");
  return [...starts.sort(byLen), ...contains.sort(byLen)].slice(0, limit);
}
