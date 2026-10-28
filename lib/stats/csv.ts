import type { QuestionsFile } from "@/lib/content/schemas";
import { QUESTION_IDS } from "@/lib/compose/types";
import { chartOrder, type StatsResult } from "./aggregate";

/**
 * Otevřená data (SPEC §8): agregované CSV. Kategorie pod 10 lidí se slučují do jednoho
 * řádku; když je i sloučený součet pod 10, počet se nezveřejní.
 */
export const MIN_CELL = 10;

function cell(v: string | number): string {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toOpenDataCsv(
  stats: StatsResult,
  file: QuestionsFile,
  labels: { merged: string; hiddenCount: string },
): string {
  const lines: string[] = [["otazka_id", "otazka", "odpoved_id", "odpoved", "pocet", "odpovedi_celkem"].join(",")];
  for (const qid of QUESTION_IDS) {
    const q = file.questions.find((x) => x.id === qid)!;
    const qs = stats.questions[qid];
    let merged = 0;
    let mergedAny = false;
    for (const { key, label } of chartOrder(file, qid)) {
      const n = qs.counts[key] ?? 0;
      if (n === 0) continue;
      if (n < MIN_CELL) {
        merged += n;
        mergedAny = true;
        continue;
      }
      lines.push([qid, q.text, key, label, n, qs.total].map(cell).join(","));
    }
    if (mergedAny)
      lines.push(
        [qid, q.text, "ostatni", labels.merged, merged >= MIN_CELL ? merged : labels.hiddenCount, qs.total]
          .map(cell)
          .join(","),
      );
  }
  return lines.join("\n") + "\n";
}
