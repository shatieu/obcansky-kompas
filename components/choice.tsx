"use client";

import { Check } from "lucide-react";

/**
 * Volba (SPEC §4.4): blok přes celou šířku, linka 2 px, min. výška 56 px.
 * Vybraná = plná modrá s textem v --on-blue. Zašedlá = ztlumená + šrafa + štítek
 * „Nejde s: …“; klepnutí neotevře výběr, ale vysvětlení (onDisabledClick).
 */
export function Choice({
  label,
  selected,
  disabledLabel,
  multi = false,
  onSelect,
  onDisabledClick,
  disabledOpen = false,
  describedBy,
}: {
  label: string;
  selected: boolean;
  disabledLabel?: string;
  multi?: boolean;
  onSelect: () => void;
  onDisabledClick?: () => void;
  disabledOpen?: boolean;
  describedBy?: string;
}) {
  const disabled = Boolean(disabledLabel);
  if (disabled) {
    return (
      <button
        type="button"
        onClick={onDisabledClick}
        aria-expanded={disabledOpen}
        aria-describedby={describedBy}
        className="hatch flex min-h-14 w-full flex-col items-start justify-center border-2 border-muted px-4 py-2 text-left text-muted"
      >
        <span className="text-lg line-through decoration-1">{label}</span>
        <span className="text-sm font-semibold">{disabledLabel}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      aria-describedby={describedBy}
      onClick={onSelect}
      className={`flex min-h-14 w-full items-center justify-between gap-3 border-2 px-4 py-2 text-left text-lg transition-colors transition-fast ${
        selected ? "border-blue bg-blue font-semibold text-on-blue" : "border-ink bg-surface text-ink hover:bg-blue-tint"
      }`}
    >
      <span>{label}</span>
      {selected && <Check aria-hidden className="size-6 shrink-0" />}
    </button>
  );
}
