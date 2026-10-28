import { questionsFile, ui } from "@/lib/content";
import { toOpenDataCsv } from "@/lib/stats/csv";
import { getStats, STATS_CACHE_CONTROL } from "@/lib/stats/source";

/** Otevřená data (SPEC §8): agregované CSV, kategorie pod 10 lidí sloučené. */
export async function GET() {
  const stats = await getStats({});
  if (!stats) return new Response("unavailable\n", { status: 503, headers: { "Cache-Control": "no-store" } });
  const csv = toOpenDataCsv(stats, questionsFile, { merged: ui.stats.merged_label, hiddenCount: ui.stats.hidden_count });
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="obcansky-kompas-odpovedi.csv"',
      "Cache-Control": STATS_CACHE_CONTROL,
    },
  });
}
