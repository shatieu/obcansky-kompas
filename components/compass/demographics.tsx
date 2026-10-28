"use client";

import { useEffect } from "react";
import { questionsFile, t, ui } from "@/lib/content";
import type { Demographics as DemographicsValue } from "@/lib/compose/types";
import { AnswerOption } from "@/components/ui/answer";
import { Select, TextArea } from "@/components/ui/fields";
import { ScreenHeading } from "@/components/ui/typography";

/** Demografie (SPEC §5.3) – vše nepovinné. Opětovné klepnutí volbu zruší. */
export function Demographics({
  value,
  onChange,
  headingRef,
  focusOnMount = false,
}: {
  value: DemographicsValue;
  onChange: (v: DemographicsValue) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  /** Načteno líně po navigaci: fokus z `goTo` přišel dřív, než byl nadpis v DOM. */
  focusOnMount?: boolean;
}) {
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jen při připojení
  }, []);
  const d = questionsFile.demographics;
  const set = (patch: Partial<DemographicsValue>) => {
    const next = { ...value, ...patch };
    for (const k of Object.keys(next) as (keyof DemographicsValue)[]) if (!next[k]) delete next[k];
    onChange(next);
  };
  const comment = value.comment ?? "";

  return (
    <section aria-labelledby="h-demo">
      <ScreenHeading id="h-demo" headingRef={headingRef} title={ui.demographics.title} lead={ui.demographics.lead} />

      <div className="mt-4">
        <Select
          id="demo-region"
          label={ui.demographics.region_label}
          value={value.region ?? ""}
          onChange={(e) => set({ region: e.target.value || undefined })}
          placeholder={ui.demographics.region_placeholder}
          placeholderSelectable
          options={d.regions.map((r) => ({ value: r.id, label: r.label }))}
        />
      </div>

      <fieldset className="mt-4">
        <legend className="k-field__label mb-1">{ui.demographics.age_label}</legend>
        <div role="radiogroup" aria-label={ui.demographics.age_label} className="grid grid-cols-2 gap-1">
          {d.age_groups.map((a) => (
            <AnswerOption
              key={a.id}
              label={a.label}
              selected={value.ageGroup === a.id}
              onSelect={() => set({ ageGroup: value.ageGroup === a.id ? undefined : a.id })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="k-field__label mb-1">{ui.demographics.size_label}</legend>
        <div role="radiogroup" aria-label={ui.demographics.size_label} className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {d.municipality_sizes.map((m) => (
            <AnswerOption
              key={m.id}
              label={m.label}
              selected={value.municipalitySize === m.id}
              onSelect={() => set({ municipalitySize: value.municipalitySize === m.id ? undefined : m.id })}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <TextArea
          id="demo-comment"
          label={ui.demographics.comment_label}
          hint={ui.demographics.comment_hint}
          counter={t(ui.demographics.chars_left, { n: d.comment_max - comment.length })}
          maxLength={d.comment_max}
          rows={4}
          value={comment}
          onChange={(e) => set({ comment: e.target.value.slice(0, d.comment_max) || undefined })}
        />
      </div>
    </section>
  );
}
