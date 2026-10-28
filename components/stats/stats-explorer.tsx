"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { questionsFile, ui } from "@/lib/content";
import type { StatsFilters, StatsResult } from "@/lib/stats/aggregate";
import { filtersToQuery } from "@/lib/stats/filters";
import { WaitBar } from "@/components/flag";
import { buttonLink } from "@/components/sticky-action";
import { StatsCharts, StatsCounts } from "./stats-charts";

/**
 * Filtry kraj / věk / velikost obce (SPEC §8). Data jdou z GET /api/stats (CDN cache 60 s),
 * první vykreslení dostane stránka z ISR. Filtry se drží v URL.
 */
export function StatsExplorer({ initial }: { initial: StatsResult | null }) {
  const [filters, setFilters] = useState<StatsFilters>({});
  const [stats, setStats] = useState<StatsResult | null>(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(initial === null);
  const first = useRef(true);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f: StatsFilters = {};
    const r = p.get("kraj");
    const a = p.get("vek");
    const o = p.get("obec");
    if (r) f.region = r;
    if (a) f.ageGroup = a;
    if (o) f.municipalitySize = o;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jednorázové načtení filtrů z URL
    if (Object.keys(f).length) setFilters(f);
  }, []);

  useEffect(() => {
    if (first.current && Object.keys(filters).length === 0) {
      first.current = false;
      if (initial) return;
    }
    first.current = false;
    const q = filtersToQuery(filters);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${q}`);
    } catch {
      /* nic */
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/stats${q}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<StatsResult>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => {
        setStats(s);
        setFailed(false);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setFailed(true);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [filters, initial]);

  const d = questionsFile.demographics;
  const selects: { key: keyof StatsFilters; label: string; options: { id: string; label: string }[] }[] = [
    { key: "region", label: ui.stats.filter_region, options: d.regions },
    { key: "ageGroup", label: ui.stats.filter_age, options: d.age_groups },
    { key: "municipalitySize", label: ui.stats.filter_size, options: d.municipality_sizes },
  ];

  return (
    <div>
      <fieldset className="mt-8 border-t-2 border-ink pt-4">
        <legend className="sr-only">{ui.stats.filters_title}</legend>
        <p className="text-xl font-bold" aria-hidden>
          {ui.stats.filters_title}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {selects.map((s) => (
            <label key={s.key} className="block">
              <span className="font-semibold">{s.label}</span>
              <select
                value={filters[s.key] ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, [s.key]: e.target.value || undefined }))}
                className="mt-1 min-h-12 w-full border-2 border-ink bg-surface px-3"
              >
                <option value="">{ui.stats.filter_all}</option>
                {s.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {Object.values(filters).some(Boolean) && (
          <button type="button" className={buttonLink} onClick={() => setFilters({})}>
            {ui.stats.reset_button}
          </button>
        )}
      </fieldset>

      <div className="mt-4 h-1">{loading && <WaitBar label={ui.stats.loading} />}</div>

      {failed && (
        <p role="alert" className="mt-4 flex items-start gap-2 border-l-4 border-ink py-1 pl-3 font-semibold">
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
          {ui.stats.unavailable}
        </p>
      )}
      {stats && (
        <div aria-busy={loading}>
          <StatsCounts stats={stats} />
          <StatsCharts stats={stats} />
        </div>
      )}
    </div>
  );
}
