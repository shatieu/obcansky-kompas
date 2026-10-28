import type { Question } from "@/lib/content/schemas";
import type { AnswerValue } from "@/lib/compose/types";

/** Nová hodnota otázky s více volbami po klepnutí na volbu (výlučné volby vyřadí ostatní). */
export function nextMultiValue(q: Question, current: AnswerValue | undefined, optionId: string): string[] | undefined {
  const cur = Array.isArray(current) ? current : [];
  const opt = q.options.find((o) => o.id === optionId)!;
  if (opt.exclusive) return cur.includes(optionId) ? undefined : [optionId];
  const rest = cur.filter((o) => !q.options.find((x) => x.id === o)?.exclusive);
  return rest.includes(optionId) ? rest.filter((o) => o !== optionId) : [...rest, optionId];
}
