"use client";

import { useEffect, useRef, useState } from "react";
import { questionsFile, ui } from "@/lib/content";
import type { StatsFilters, StatsResult } from "@/lib/stats/aggregate";
import { filtersToQuery } from "@/lib/stats/filters";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/fields";
import { Notice } from "@/components/ui/typography";
import { WaitBar } from "@/components/ui/wait-bar";
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
      <fieldset className="mt-3">
        <legend className="k-sr">{ui.stats.filters_title}</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {selects.map((s) => (
            <Select
              key={s.key}
              label={s.label}
              value={filters[s.key] ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, [s.key]: e.target.value || undefined }))}
              placeholder={ui.stats.filter_all}
              placeholderSelectable
              options={s.options.map((o) => ({ value: o.id, label: o.label }))}
            />
          ))}
        </div>
        {Object.values(filters).some(Boolean) && (
          <Button variant="secondary" className="-ml-1 mt-1" onClick={() => setFilters({})}>
            {ui.stats.reset_button}
          </Button>
        )}
      </fieldset>

      <div className="mt-2 h-0.5">{loading && <WaitBar label={ui.stats.loading} />}</div>

      {failed && (
        <Notice role="alert" className="mt-2">
          {ui.stats.unavailable}
        </Notice>
      )}
      {stats && (
        <div aria-busy={loading}>
          <StatsCounts stats={stats} />
          <div className="mt-4">
            <StatsCharts stats={stats} />
          </div>
        </div>
      )}
    </div>
  );
}
