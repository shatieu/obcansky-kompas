import { questionsFile } from "@/lib/content";
import type { StatsFilters } from "./aggregate";

/** Parametry URL filtrů: ?kraj=CZ010&vek=30-44&obec=do-2000. Neznámé hodnoty se ignorují. */
export const FILTER_PARAMS = { region: "kraj", ageGroup: "vek", municipalitySize: "obec" } as const;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(src: ParamSource, key: string): string | undefined {
  if (src instanceof URLSearchParams) return src.get(key) ?? undefined;
  const v = src[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseFilters(src: ParamSource): StatsFilters {
  const d = questionsFile.demographics;
  const pick = (key: string, allowed: { id: string }[]) => {
    const v = read(src, key);
    return v && allowed.some((a) => a.id === v) ? v : undefined;
  };
  const f: StatsFilters = {};
  const region = pick(FILTER_PARAMS.region, d.regions);
  const ageGroup = pick(FILTER_PARAMS.ageGroup, d.age_groups);
  const municipalitySize = pick(FILTER_PARAMS.municipalitySize, d.municipality_sizes);
  if (region) f.region = region;
  if (ageGroup) f.ageGroup = ageGroup;
  if (municipalitySize) f.municipalitySize = municipalitySize;
  return f;
}

export function filtersToQuery(f: StatsFilters): string {
  const p = new URLSearchParams();
  if (f.region) p.set(FILTER_PARAMS.region, f.region);
  if (f.ageGroup) p.set(FILTER_PARAMS.ageGroup, f.ageGroup);
  if (f.municipalitySize) p.set(FILTER_PARAMS.municipalitySize, f.municipalitySize);
  const s = p.toString();
  return s ? `?${s}` : "";
}
