"use client";

import { useRef, type KeyboardEvent } from "react";
import { t, ui } from "@/lib/content";

export type NavState = "done" | "current" | "todo" | "skipped";

export interface NavItem {
  /** Krátký název otázky (questions.yaml `short`). */
  label: string;
  state: NavState;
}

const STATE_TEXT: Record<NavState, string> = {
  done: ui.compass.nav_state_done,
  current: ui.compass.nav_state_current,
  todo: ui.compass.nav_state_todo,
  skipped: ui.compass.nav_state_skipped,
};

/**
 * Navigace kompasu: segmentovaný průběh, kde je každý segment tlačítko (min. 48 × 48 px, s číslem
 * otázky; pod 480 px dvě řady po čtyřech) – skok na libovolnou otázku, i na zašedlou (aby bylo vidět proč). Klávesnice:
 * Tab vstoupí na aktuální segment, šipky/Home/End přesouvají fokus (roving tabindex).
 * Aktuální segment je červený – jediný červený prvek obrazovky kvízu.
 */
export function QuestionNav({
  items,
  current,
  onSelect,
  summary,
}: {
  items: NavItem[];
  /** 0-based index aktuální otázky, -1 = žádná (demografie, přehled). */
  current: number;
  onSelect: (index: number) => void;
  /** Tlačítko „Přehled odpovědí“ – jen když už existuje aspoň jedna odpověď. */
  summary: { available: boolean; current: boolean; onSelect: () => void };
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const total = items.length;
  const tabStop = current >= 0 ? current : 0;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const target =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? Math.min(i + 1, total - 1)
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? Math.max(i - 1, 0)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? total - 1
              : null;
    if (target === null) return;
    e.preventDefault();
    listRef.current?.querySelectorAll("button")[target]?.focus();
  };

  return (
    <nav aria-label={ui.compass.nav_aria}>
      <ol ref={listRef} className="k-qnav">
        {items.map((it, i) => (
          <li key={i}>
            <button
              type="button"
              className="k-qnav__seg"
              data-s={it.state}
              aria-current={i === current ? "step" : undefined}
              aria-label={`${t(ui.compass.nav_item, { n: i + 1, total, question: it.label })} – ${STATE_TEXT[it.state]}`}
              tabIndex={i === tabStop ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onSelect(i)}
            >
              <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className="k-qnav__bar" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <div className="k-progress__label">
        {current >= 0 ? (
          <span className="k-kicker" aria-hidden="true">
            {t(ui.compass.progress_label, { n: current + 1, total })}
          </span>
        ) : (
          <span />
        )}
        {summary.available ? (
          <button
            type="button"
            className="k-link k-qnav__summary"
            aria-current={summary.current ? "page" : undefined}
            onClick={summary.onSelect}
          >
            {ui.compass.summary_nav_button}
          </button>
        ) : (
          current >= 0 && (
            <span className="k-progress__count" aria-hidden="true">
              {String(current + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
            </span>
          )
        )}
      </div>
    </nav>
  );
}
