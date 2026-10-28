"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * Malé prvky podle designového systému (docs/design-system/project: Icon, SelectMark,
 * Checkbox, StepSlider, Button, StickyBar) pro /akce a /v/[uuid]/zakon.
 * TODO(core): až budou v components/* sdílené verze, nahradit importem a tento soubor smazat.
 * Rozměry jsou v px (arbitrary values), aby nezávisely na tom, zda platí --spacing 4 px nebo 8 px.
 */

const PATHS = {
  "arrow-right": "M4 12h15M13 6l6 6-6 6",
  "chevron-down": "M5 9l7 7 7-7",
  plus: "M12 4v16M4 12h16",
  minus: "M4 12h16",
  alert: "M12 7v6.5M12 16.5v.01M3 3h18v18H3z",
  info: "M12 10.5V17M12 7v.01M3 3h18v18H3z",
  download: "M12 4v11M7 10l5 5 5-5M4 20h16",
  mail: "M3 5h18v14H3zM3 5l9 8 9-8",
  law: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  copy: "M8 8h12v12H8zM4 16V4h12",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Značka výběru: prázdný kruh, nebo bílý kruh s celou vlajkou 3:2 (žádné fajfky). */
export function SelectMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-[28px] shrink-0 items-center justify-center border-2 ${on ? "border-on-blue bg-[#FFFFFF]" : "border-current"}`}
      style={{ borderRadius: "50%" }}
    >
      {on && (
        <svg viewBox="0 0 900 600" width={20} height={13.3} style={{ display: "block" }}>
          <rect x="0" y="0" width="900" height="300" fill="#FFFFFF" />
          <rect x="0" y="300" width="900" height="300" fill="#D7141A" />
          <path d="M0 0L450 300 0 600z" fill="#11457E" />
          <rect x="0" y="0" width="900" height="600" fill="none" stroke="#0B1B33" strokeWidth="24" />
        </svg>
      )}
    </span>
  );
}

/** Zaškrtávací volba přes celou šířku (min. 56 px). Vybraná = plná modrá + vlajka v kruhu. */
export function CheckRow({
  label,
  caption,
  checked,
  onChange,
  compact = false,
  children,
}: {
  label: string;
  caption?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <label
      className={`relative flex w-full cursor-pointer items-center gap-[16px] border-2 px-[16px] transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-focus ${
        compact ? "min-h-[48px] py-[8px]" : "min-h-[56px] py-[12px]"
      } ${checked ? "border-blue bg-blue text-on-blue" : "border-ink bg-surface text-ink hover:bg-blue-tint"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0"
      />
      <SelectMark on={checked} />
      <span className="min-w-0 flex-1">
        <span className={`block ${compact ? "text-[17px] font-medium" : "text-[17px] font-semibold"}`}>{label}</span>
        {caption && <span className="block text-[14px] leading-[20px] font-medium">{caption}</span>}
        {children}
      </span>
    </label>
  );
}

/**
 * Posuvník o 3 stupních (StepSlider z designového systému): kolejnice se 3 úseky,
 * vybraný úsek je plná modrá. Klávesy ← → mění stupeň.
 */
export function StepSlider({ label, steps, value, onChange }: { label: string; steps: string[]; value: number; onChange: (i: number) => void }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? value + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? value - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(steps.length - 1, next));
    onChange(i);
    refs.current[i]?.focus();
  };
  return (
    <div>
      <p id={id} className="mb-[8px] text-[17px] font-semibold">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-3 border-2 border-ink" onKeyDown={onKey}>
        {steps.map((s, i) => (
          <button
            key={s}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === i}
            tabIndex={value === i ? 0 : -1}
            onClick={() => onChange(i)}
            className={`min-h-[56px] px-[8px] py-[8px] text-center text-[15px] leading-[20px] font-semibold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-focus ${
              i > 0 ? "border-l-2 border-ink" : ""
            } ${value === i ? "bg-blue text-on-blue" : "bg-surface text-ink hover:bg-blue-tint"}`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Primární tlačítko (60 px, celá šířka na mobilu). */
export const btnPrimary =
  "inline-flex min-h-[60px] w-full items-center justify-between gap-[16px] bg-blue px-[24px] font-wide text-[16px] font-bold text-on-blue transition-colors duration-150 hover:bg-ink hover:text-surface focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus aria-busy:cursor-wait md:w-auto md:min-w-[320px]";

/** Sekundární textové tlačítko (max. jedno na obrazovce). */
export const btnText =
  "inline-flex min-h-[48px] items-center gap-[8px] px-[8px] font-semibold text-blue underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus";

/** Řádek akce v seznamu (ne řada tlačítek): text + ikona vpravo, linka nahoře. */
export const actionRow =
  "flex min-h-[56px] w-full items-center justify-between gap-[16px] border-t-2 border-ink px-[4px] text-left text-[17px] font-semibold text-ink no-underline transition-colors duration-150 hover:bg-blue-tint focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-focus aria-busy:cursor-wait";

/** Přilepená primární akce dole (mobil), v toku na desktopu. */
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 -mx-[16px] border-t-2 border-ink bg-surface px-[16px] py-[12px] md:static md:mx-0 md:mt-[32px] md:border-t-0 md:px-0">
      {children}
    </div>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="font-wide text-[13px] leading-[16px] font-bold tracking-[0.08em] uppercase">{children}</p>;
}

export function ScreenHeading({ kicker, title, lead }: { kicker: string; title: string; lead?: string }) {
  return (
    <header className="pt-[24px] pb-[24px] md:pt-[48px]">
      <Kicker>{kicker}</Kicker>
      <h1 className="mt-[8px] font-wide text-[32px] leading-[36px] font-extrabold tracking-[-0.02em] lg:text-[48px] lg:leading-[50px]">{title}</h1>
      {lead && <p className="mt-[8px] max-w-[688px] text-[17px] leading-[26px]">{lead}</p>}
    </header>
  );
}

export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="font-wide text-[22px] leading-[26px] font-bold tracking-[-0.01em]">
      {children}
    </h2>
  );
}

/** Chyba: text + ikona + 4px linka v --ink (nikdy červeně). */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-[8px] flex items-start gap-[8px] border-l-4 border-ink py-[4px] pl-[12px] font-semibold">
      <Icon name="alert" className="mt-[1px] shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export const fieldLabel = "block text-[17px] font-semibold";
export const fieldHint = "block text-[14px] leading-[20px] font-medium text-ink-secondary";
export const inputBase =
  "mt-[8px] block min-h-[56px] w-full border-2 border-ink bg-surface px-[16px] py-[12px] text-[17px] text-ink placeholder:text-muted focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus";
