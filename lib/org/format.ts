import { formatAmount } from "@/lib/compose/q1";
import type { AnswerValue } from "@/lib/compose/types";
import type { Question } from "@/lib/content/schemas";

/** Popisek odpovědi pro /hnuti: částka Q1, název volby, nebo seznam voleb u Q7. */
export function answerLabel(
  q: Question,
  value: AnswerValue | undefined,
  units: { unit_decimal: string; unit_whole: string },
): string | null {
  if (value === undefined) return null;
  if (typeof value === "number") return formatAmount(value, units);
  const label = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
  if (Array.isArray(value)) return value.length ? value.map(label).join(", ") : null;
  return label(value);
}

/** „28. 10. 2026“ v české časové zóně (stejně na serveru i v prohlížeči). */
export function formatDateCz(iso: string): string {
  const parts = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}. ${get("month")}. ${get("year")}`;
}
