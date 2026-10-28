"use client";

import { useId, type CSSProperties } from "react";
import { cx, formatCz, NB } from "./format";
import { Icon } from "./icon";

export interface BudgetAnchor {
  value: number;
  label: string;
}

export interface BudgetSliderTexts {
  /** Popisek posuvníku pro čtečky. */
  label: string;
  /** Jednotka u bubliny a hodnoty, např. „mld“. */
  unit: string;
  /** Text za hodnotou, např. „Kč ročně“. */
  perYear: string;
  decreaseAria: string;
  increaseAria: string;
  /** Šablona aria-valuetext, {value} = „9,2“, {where} = text bubliny. */
  valueText: string;
  /** Šablona aria-label zářezu, {label}, {value}. */
  notchAria: string;
}

const DEFAULT_TEXTS: BudgetSliderTexts = {
  label: "Roční rozpočet ČT a ČRo",
  unit: "mld",
  perYear: "Kč ročně",
  decreaseAria: "Méně o 100 milionů",
  increaseAria: "Více o 100 milionů",
  valueText: "{value} miliardy korun ročně, {where}",
  notchAria: "Nastavit na {label}: {value} miliardy",
};

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Hodnota po přichycení: do `snap` od kotvy skočí na kotvu. */
export function snapToAnchor(x: number, anchors: BudgetAnchor[], snap: number, min: number, max: number): number {
  const n = round1(Math.min(max, Math.max(min, x)));
  const near = anchors.find((a) => Math.abs(a.value - n) <= snap + 1e-9);
  return near ? near.value : n;
}

/**
 * Posuvník rozpočtu (README „Sliders“, pohyb.md §3). Nikdy statické popisky pod dráhou:
 * bublina jede nad jezdcem a vždy říká, kde jsi – na kotvě je plná modrá a kotvu jmenuje,
 * mezi kotvami ukazuje rozdíl k nejbližší. Do 0,15 mld od kotvy se jezdec přichytí.
 * Kotvy jsou malé klikací zářezy. Řízená komponenta: hodnotu drží rodič.
 */
export function BudgetSlider({
  value: v,
  min = 5,
  max = 12,
  step = 0.1,
  snap = 0.15,
  anchors = [],
  live,
  idle = false,
  onChange,
  texts: textsIn,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  snap?: number;
  anchors?: BudgetAnchor[];
  /** Živý řádek pod posuvníkem (např. „≈ 85 Kč měsíčně na dospělého“). */
  live?: string | null;
  /** Uživatel ještě nehýbal / zvolil Nevím → hodnota ztlumená. */
  idle?: boolean;
  onChange: (v: number) => void;
  texts?: Partial<BudgetSliderTexts>;
}) {
  const texts = { ...DEFAULT_TEXTS, ...textsIn };
  const id = useId();
  const set = (x: number) => onChange(snapToAnchor(x, anchors, snap, min, max));
  const nudge = (d: number) => onChange(round1(Math.min(max, Math.max(min, v + d))));
  const pct = (x: number) => ((x - min) / (max - min)) * 100;
  const hit = anchors.find((a) => Math.abs(a.value - v) < 1e-9);
  const nearest = anchors.slice().sort((a, b) => Math.abs(a.value - v) - Math.abs(b.value - v))[0];
  const diff = nearest ? round1(v - nearest.value) : 0;
  const delta = `${diff > 0 ? "+" : "−"}${NB}${formatCz(Math.abs(diff), 1)}${NB}${texts.unit}`;
  const say = hit ? hit.label : nearest ? `${nearest.label} ${delta}` : "";
  const p = pct(v);
  const calloutStyle = { left: `calc(14px + (100% - 28px) * ${p / 100})`, "--shift": `-${p}%`, "--tip": `${p}%` } as CSSProperties;

  return (
    <div className={cx("k-budget", idle && "k-budget--idle")}>
      <p className="k-budget__value" aria-hidden="true">
        <span className="k-stat-l">
          {formatCz(v, 1)}
          {NB}
          {texts.unit}
        </span>
        <span className="k-budget__unit">{texts.perYear}</span>
      </p>
      <div className="k-budget__ctrl">
        <button type="button" className="k-iconbtn" aria-label={texts.decreaseAria} onClick={() => nudge(-step)} disabled={v <= min}>
          <Icon name="minus" />
        </button>
        <div className="k-budget__track">
          {nearest && (
            <div className={cx("k-callout", hit && "k-callout--hit")} style={calloutStyle} aria-hidden="true">
              <span className="k-callout__box" key={hit ? hit.label : "between"}>
                {hit ? (
                  <b>{hit.label}</b>
                ) : (
                  <>
                    <b>{nearest.label}</b> {delta}
                  </>
                )}
              </span>
              <span className="k-callout__tip" />
            </div>
          )}
          <label htmlFor={id} className="k-sr">
            {texts.label}
          </label>
          <input
            id={id}
            className="k-range"
            type="range"
            min={min}
            max={max}
            step={step}
            value={v}
            onChange={(e) => set(parseFloat(e.target.value))}
            aria-valuetext={fill(texts.valueText, { value: formatCz(v, 1), where: say })}
          />
          <div className="k-budget__rail">
            {anchors.map((a) => (
              <button
                type="button"
                key={a.label}
                className="k-notch"
                data-hit={hit === a}
                style={{ left: `${pct(a.value)}%` }}
                aria-label={fill(texts.notchAria, { label: a.label, value: formatCz(a.value, 1) })}
                onClick={() => set(a.value)}
              />
            ))}
          </div>
        </div>
        <button type="button" className="k-iconbtn" aria-label={texts.increaseAria} onClick={() => nudge(step)} disabled={v >= max}>
          <Icon name="plus" />
        </button>
      </div>
      <p className="k-budget__live" aria-live="polite">
        {live}
        <span className="k-sr">. {say}</span>
      </p>
    </div>
  );
}
