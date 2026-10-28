"use client";

import { Minus, Plus } from "lucide-react";
import type { Anchor } from "@/lib/compose/q1";
import { formatBn, round1 } from "@/lib/compose/q1";

/**
 * Posuvník Q1 (SPEC §4.4): velká hodnota nad posuvníkem, kotvy jako svislé značky,
 * krok 0,1 mld, tlačítka −/+, ovládání klávesnicí (nativní range input).
 */
export function AmountSlider({
  value,
  min,
  max,
  step,
  anchors,
  active,
  onChange,
  texts,
  perAdult,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  anchors: Anchor[];
  /** false = uživatel ještě nehýbal / zvolil Nevím → hodnota je jen ztlumená. */
  active: boolean;
  onChange: (v: number) => void;
  texts: { unit: string; perYear: string; sliderAria: string; decreaseAria: string; increaseAria: string };
  perAdult: string | null;
}) {
  const clamp = (v: number) => round1(Math.min(max, Math.max(min, v)));
  const pos = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div>
      <p className={`tabular text-5xl font-bold leading-none md:text-6xl ${active ? "text-ink" : "text-muted"}`} aria-live="polite">
        {formatBn(value)} <span className="text-2xl font-semibold">{texts.unit}</span>
      </p>
      <p className="mt-1 text-muted">
        {texts.perYear}
        {perAdult && <span className="tabular"> · {perAdult}</span>}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          aria-label={texts.decreaseAria}
          className="inline-flex size-12 shrink-0 items-center justify-center border-2 border-ink hover:bg-blue-tint"
        >
          <Minus aria-hidden className="size-5" />
        </button>
        <div className="relative flex-1 pb-16">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={texts.sliderAria}
            aria-valuetext={`${formatBn(value)} ${texts.unit}`}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            className="h-12 w-full cursor-pointer accent-[var(--blue)]"
          />
          {anchors.map((a, i) => (
            <div
              key={a.id}
              className="pointer-events-none absolute top-10 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pos(a.value)}%` }}
            >
              <span className="h-4 w-0.5 bg-ink" aria-hidden />
              <span
                className={`tabular whitespace-nowrap text-xs font-semibold leading-tight ${i % 2 ? "mt-6" : "mt-0.5"}`}
              >
                {a.label}
                <span className="block text-center font-normal text-muted">{formatBn(a.value)}</span>
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          aria-label={texts.increaseAria}
          className="inline-flex size-12 shrink-0 items-center justify-center border-2 border-ink hover:bg-blue-tint"
        >
          <Plus aria-hidden className="size-5" />
        </button>
      </div>
      <ul className="sr-only">
        {anchors.map((a) => (
          <li key={a.id}>
            {a.label}: {formatBn(a.value)} {texts.unit}
          </li>
        ))}
      </ul>
    </div>
  );
}
