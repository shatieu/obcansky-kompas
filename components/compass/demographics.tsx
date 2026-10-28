"use client";

import { questionsFile, t, ui } from "@/lib/content";
import type { Demographics as DemographicsValue } from "@/lib/compose/types";
import { Choice } from "@/components/choice";

/** Demografie (SPEC §5.3) – vše nepovinné. Opětovné klepnutí volbu zruší. */
export function Demographics({
  value,
  onChange,
  headingRef,
}: {
  value: DemographicsValue;
  onChange: (v: DemographicsValue) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const d = questionsFile.demographics;
  const set = (patch: Partial<DemographicsValue>) => {
    const next = { ...value, ...patch };
    for (const k of Object.keys(next) as (keyof DemographicsValue)[]) if (!next[k]) delete next[k];
    onChange(next);
  };
  const comment = value.comment ?? "";

  return (
    <section aria-labelledby="h-demo">
      <h1 id="h-demo" ref={headingRef} tabIndex={-1} className="text-[2rem] font-bold leading-tight outline-none md:text-[2.5rem]">
        {ui.demographics.title}
      </h1>
      <p className="mt-2 text-muted">{ui.demographics.lead}</p>

      <div className="mt-6">
        <label htmlFor="demo-region" className="block font-semibold">
          {ui.demographics.region_label}
        </label>
        <select
          id="demo-region"
          value={value.region ?? ""}
          onChange={(e) => set({ region: e.target.value || undefined })}
          className="mt-2 min-h-14 w-full border-2 border-ink bg-surface px-3 text-lg"
        >
          <option value="">{ui.demographics.region_placeholder}</option>
          {d.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="mt-8">
        <legend className="font-semibold">{ui.demographics.age_label}</legend>
        <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-3">
          {d.age_groups.map((a) => (
            <Choice
              key={a.id}
              label={a.label}
              selected={value.ageGroup === a.id}
              onSelect={() => set({ ageGroup: value.ageGroup === a.id ? undefined : a.id })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="font-semibold">{ui.demographics.size_label}</legend>
        <div role="radiogroup" className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {d.municipality_sizes.map((m) => (
            <Choice
              key={m.id}
              label={m.label}
              selected={value.municipalitySize === m.id}
              onSelect={() => set({ municipalitySize: value.municipalitySize === m.id ? undefined : m.id })}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-8">
        <label htmlFor="demo-comment" className="block font-semibold">
          {ui.demographics.comment_label}
        </label>
        <p id="demo-comment-hint" className="text-sm text-muted">
          {ui.demographics.comment_hint}
        </p>
        <textarea
          id="demo-comment"
          aria-describedby="demo-comment-hint demo-comment-count"
          maxLength={d.comment_max}
          rows={4}
          value={comment}
          onChange={(e) => set({ comment: e.target.value.slice(0, d.comment_max) || undefined })}
          className="mt-2 w-full border-2 border-ink bg-surface p-3 text-lg"
        />
        <p id="demo-comment-count" className="tabular text-sm text-muted">
          {t(ui.demographics.chars_left, { n: d.comment_max - comment.length })}
        </p>
      </div>
    </section>
  );
}
