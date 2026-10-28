"use client";

import { useId, type ReactNode, type Ref } from "react";
import { cx } from "./format";
import { SelectMark } from "./flag";
import { Icon } from "./icon";

type ForcedState = "hover" | "focus" | "active";

/**
 * Volba odpovědi (min. 56 px, linka 2 px). Vybraná = plná modrá + on-blue + vlajka v kruhu.
 * Nedostupná = šrafa + muted + štítek „Nejde s: …“; klepnutí volá onExplain (vysvětlení), ne výběr.
 */
export function AnswerOption({
  label,
  selected = false,
  disabled = false,
  conflict,
  tag,
  multiple = false,
  state,
  onSelect,
  onExplain,
  explainLabel = "Proč to nejde?",
  expanded,
  describedBy,
  children,
}: {
  label: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  /** Zobrazí se jako „Nejde s: …“. */
  conflict?: string;
  /** Celý štítek nedostupné volby (má přednost před `conflict`). */
  tag?: ReactNode;
  multiple?: boolean;
  state?: ForcedState;
  onSelect?: () => void;
  /** Klepnutí na nedostupnou volbu. */
  onExplain?: () => void;
  explainLabel?: string;
  /** U nedostupné volby: je vysvětlení otevřené? */
  expanded?: boolean;
  describedBy?: string;
  children?: ReactNode;
}) {
  const onClick = () => (disabled ? onExplain?.() : onSelect?.());
  const tagText = tag ?? (conflict ? `Nejde s: ${conflict}` : null);
  return (
    <button
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      aria-expanded={disabled && expanded !== undefined ? expanded : undefined}
      aria-describedby={describedBy}
      data-state={state}
      className="k-opt"
      onClick={onClick}
    >
      <SelectMark on={selected} />
      <span className="k-opt__text">
        <span>{label}</span>
        {disabled && tagText && (
          <>
            <br />
            <span className="k-opt__tag">{tagText}</span>
          </>
        )}
        {children}
      </span>
      {disabled && (
        <span className="k-opt__aside">
          <Icon name="info" title={explainLabel} />
        </span>
      )}
    </button>
  );
}

/**
 * Skupina odpovědí: legenda = nadpis otázky (h1) + nejvýš jedna věta. Chyba skupiny = ink + ikona + 4px linka.
 */
export function AnswerGroup({
  legend,
  lede,
  error,
  multiple = false,
  headingRef,
  headingId,
  desktopLegend = false,
  children,
}: {
  legend: ReactNode;
  lede?: ReactNode;
  error?: ReactNode;
  multiple?: boolean;
  /** Ref na nadpis pro přesun fokusu mezi kroky. */
  headingRef?: Ref<HTMLHeadingElement>;
  headingId?: string;
  /** Na desktopu 48px nadpis (k-h1 už se zvětšuje od 1024 px; ponecháno pro shodu s referencí). */
  desktopLegend?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const hid = headingId ?? id;
  return (
    <fieldset
      className={cx("k-group", error ? "k-group--error" : undefined)}
      role={multiple ? "group" : "radiogroup"}
      aria-labelledby={hid}
      aria-invalid={error ? true : undefined}
      data-desktop={desktopLegend || undefined}
    >
      <legend className="k-group__legend">
        <h1 id={hid} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="k-h k-h1 outline-none">
          {legend}
        </h1>
        {lede && <span className="k-lede block">{lede}</span>}
      </legend>
      {error && (
        <p className="k-error" role="alert">
          <Icon name="alert" />
          {error}
        </p>
      )}
      {children}
    </fieldset>
  );
}
