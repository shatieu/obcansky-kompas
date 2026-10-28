/**
 * Drobné části stránky /fotka podle design systému: ikony (24px mřížka, tah 2px,
 * hranaté konce), výběrová značka s celou vlajkou 3 : 2 a volba-rádio.
 */
import type { ReactNode } from "react";

type IconName = "plus" | "minus" | "download" | "refresh" | "alert" | "arrow-right";

const PATHS: Record<IconName, string> = {
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  refresh: "M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5",
  alert: "M12 3 2 21h20L12 3zM12 10v5M12 17.5v.5",
  "arrow-right": "M4 12h15M13 6l6 6-6 6",
};

export function Icon({ name, className = "size-6" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Celá vlajka 3 : 2 (nic přes ni), pro výběrovou značku 20 × 13,3 px. */
function MiniFlag() {
  return (
    <svg viewBox="0 0 900 600" width={20} height={13.333} aria-hidden style={{ outline: "1px solid #0B1B33", display: "block" }}>
      <rect width="900" height="300" fill="#FFFFFF" />
      <rect y="300" width="900" height="300" fill="#D7141A" />
      <path d="M0 0L450 300 0 600z" fill="#11457E" />
    </svg>
  );
}

/** SelectMark: prázdný kruh 28px, vybraný = bílý kruh s celou vlajkou. Žádné fajfky. */
export function SelectMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-[28px] shrink-0 place-items-center border-2 ${on ? "border-on-blue" : "border-current"}`}
      style={{ borderRadius: "50%", background: on ? "#FFFFFF" : undefined }}
    >
      {on && <MiniFlag />}
    </span>
  );
}

/** Volba v rádiové skupině: blok přes celou šířku, linka 2px, min. 56px. */
export function PhotoOption({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-[56px] w-full cursor-pointer items-center gap-[16px] border-2 px-[16px] py-[8px] text-[17px] leading-[24px] transition-colors duration-100 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-ink ${
        checked ? "border-blue bg-blue font-medium text-on-blue" : "border-ink bg-surface text-ink hover:bg-blue-tint"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} className="sr-only" />
      <SelectMark on={checked} />
      <span>{children}</span>
    </label>
  );
}

/** Chyba: text v ink + ikona + 4px linka v ink (nikdy červeně). */
export function PhotoErrorBox({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-[8px] border-l-4 border-ink py-[4px] pl-[12px] text-[17px] leading-[24px] text-ink">
      <Icon name="alert" />
      <span>{children}</span>
    </p>
  );
}
