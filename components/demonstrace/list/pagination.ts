import { TILE_SIZE, type TileItem } from "@/lib/demo/constants";

/**
 * Stránkování seznamu účastníků (/demonstrace/seznam). Čisté funkce: stránka = rozsah
 * position_index po PAGE_SIZE (mezery po odvolaných podpisech zůstávají, pořadí se nemění).
 * Jedna stránka leží vždy v jedné dlaždici (TILE_SIZE je násobek PAGE_SIZE).
 */
export const PAGE_SIZE = 50;

export function pageCount(maxIndex: number | null): number {
  return maxIndex === null || maxIndex < 0 ? 0 : Math.floor(maxIndex / PAGE_SIZE) + 1;
}

/** `?strana=` → číslo stránky v mezích 1…pages (neplatné = 1). */
export function parsePage(raw: string | string[] | undefined, pages: number): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = v && /^\d{1,7}$/.test(v) ? Number(v) : 1;
  return Math.min(Math.max(1, n), Math.max(1, pages));
}

export function pageRange(page: number): { lo: number; hi: number; tile: number } {
  const lo = (page - 1) * PAGE_SIZE;
  return { lo, hi: lo + PAGE_SIZE, tile: Math.floor(lo / TILE_SIZE) };
}

export function pageItems(items: readonly TileItem[], page: number): TileItem[] {
  const { lo, hi } = pageRange(page);
  return items.filter((it) => it[0] >= lo && it[0] < hi).sort((a, b) => a[0] - b[0]);
}

export function maxIndexOf(items: readonly TileItem[]): number | null {
  return items.length ? Math.max(...items.map((it) => it[0])) : null;
}
