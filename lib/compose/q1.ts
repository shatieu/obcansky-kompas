import type { FactValue as Fact, QuestionsFile } from "@/lib/content/schemas";

/** Q1: kotvy z facts.yaml, pásma, přepočet na dospělého. Žádné hodnoty natvrdo v kódu. */

export interface Anchor {
  id: string;
  label: string;
  value: number;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function q1Anchors(file: QuestionsFile, facts: Fact[]): Anchor[] {
  const q1 = file.questions.find((q) => q.id === "q1")!;
  return (q1.anchors ?? []).flatMap((a) => {
    const f = facts.find((x) => x.id === a.fact);
    if (!f || f.value === null) return [];
    return [{ id: a.id, label: a.label, value: round1(f.value * (a.multiplier ?? 1)) }];
  });
}

export interface BandThresholds {
  gov: number;
  today: number;
}

export function bandThresholds(file: QuestionsFile, facts: Fact[]): BandThresholds | null {
  const anchors = q1Anchors(file, facts);
  const gov = anchors.find((a) => a.id === "gov")?.value;
  const today = anchors.find((a) => a.id === "today")?.value;
  return gov === undefined || today === undefined ? null : { gov, today };
}

export type Q1Band = "below-gov" | "gov" | "between" | "today" | "above-today";
export const Q1_BANDS: Q1Band[] = ["below-gov", "gov", "between", "today", "above-today"];

const EPS = 0.05;

export function q1Band(value: number, t: BandThresholds): Q1Band {
  if (Math.abs(value - t.gov) < EPS) return "gov";
  if (Math.abs(value - t.today) < EPS) return "today";
  if (value < t.gov) return "below-gov";
  if (value < t.today) return "between";
  return "above-today";
}

/** Kč měsíčně na dospělého, zaokrouhleno na celé koruny; null, když chybí počet dospělých. */
export function perAdultMonthly(valueBn: number, facts: Fact[]): number | null {
  const adults = facts.find((f) => f.id === "adults-count")?.value;
  if (!adults) return null;
  return Math.round((valueBn * 1e9) / adults / 12);
}

/** „8,5“, „9“ */
export function formatBn(value: number): string {
  const r = round1(value);
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

/** „8,5 miliardy Kč“ / „9 miliard Kč“ */
export function formatAmount(value: number, units: { unit_decimal: string; unit_whole: string }): string {
  const r = round1(value);
  return `${formatBn(r)} ${Number.isInteger(r) ? units.unit_whole : units.unit_decimal}`;
}

/** Celá čísla s nezlomitelnou mezerou po tisících. */
export function formatInt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
