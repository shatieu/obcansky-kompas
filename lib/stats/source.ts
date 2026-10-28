import snapshot from "@/content/generated/stats-snapshot.json";
import { facts, questionsFile } from "@/lib/content";
import { bandThresholds } from "@/lib/compose/q1";
import { getSql, hasDatabase } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { aggregateRows, type StatsFilters, type StatsResult, type StatsRow } from "./aggregate";
import { queryStats } from "./query";

export const STATS_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * Zdroj statistik: STATIC_DEMO=1 → statický snímek seedu (SPEC §16 A), jinak jeden SQL
 * dotaz. Když DB není nastavená nebo je nedostupná, vrací null (stránka ukáže hlášku).
 */
export async function getStats(filters: StatsFilters = {}): Promise<StatsResult | null> {
  const thresholds = bandThresholds(questionsFile, facts);
  if (flags.staticDemo()) {
    return aggregateRows((snapshot as { rows: StatsRow[] }).rows, {
      filters,
      thresholds,
      demo: true,
      source: "snapshot",
    });
  }
  if (!hasDatabase()) return null;
  try {
    return await queryStats(getSql(), { filters, thresholds, includeSeed: flags.demoMode() });
  } catch (e) {
    console.error("[stats] dotaz selhal:", (e as Error).message);
    return null;
  }
}
