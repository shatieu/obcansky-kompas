import type { CSSProperties } from "react";
import { cx } from "./format";

/**
 * Vlajka – vždy 3:2, vždy celá, vždy sama (README „Vlajka“, pohyb.md).
 * Jen šířka; výška = šířka × 2/3. Obrys 1px flag-edge leží vně vlajky. Nic ji nepřekrývá.
 * FlagUnfold (potvrzení podpisu) je ve ./flag-unfold – sdílený chunk s /kompas by ho jinak nesl (150 kB).
 */
export function Flag({
  width = "100%",
  animate = false,
  unfold = false,
  label = "Česká vlajka",
  delays,
  className,
}: {
  width?: number | string;
  animate?: boolean;
  unfold?: boolean;
  /** Prázdný řetězec = dekorativní (aria-hidden). */
  label?: string;
  /** Zmrazený snímek animace (jen dokumentace). */
  delays?: { wedge: number; stripes: number };
  className?: string;
}) {
  const st = (k: "wedge" | "stripes"): CSSProperties | undefined =>
    delays ? { animationDelay: `${delays[k]}ms`, animationPlayState: "paused" } : undefined;
  return (
    <svg
      className={cx("k-flag", animate && "k-flag--animate", unfold && "k-flag--unfold", className)}
      style={{ width }}
      viewBox="0 0 900 600"
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label || undefined}
    >
      <rect className="f-white" x="0" y="0" width="900" height="300" style={st("stripes")} />
      <rect className="f-red" x="0" y="300" width="900" height="300" style={st("stripes")} />
      <path className="f-blue" d="M0 0L450 300 0 600z" style={st("wedge")} />
    </svg>
  );
}

/** Vlajka na hlavní stránce: 500 ms jednou, nikdy smyčka. */
export function FlagHero(p: Parameters<typeof Flag>[0]) {
  return <Flag animate {...p} />;
}

/** Značka v hlavičce: vlajka 24 × 16 + název. */
export function Wordmark({ href = "/", label = "Občanský kompas", ariaLabel }: { href?: string; label?: string; ariaLabel?: string }) {
  return (
    // Obyčejný odkaz místo next/link: ušetří chunk routeru na /kompas (SPEC §4.6, 150 kB).
    <a className="k-wordmark" href={href} aria-label={ariaLabel}>
      <Flag width={24} label="" />
      {label}
    </a>
  );
}

/** Výběrová značka: prázdný kruh, nebo bílý kotouč s celou vlajkou 3:2. Žádné fajfky. */
export function SelectMark({ on = false }: { on?: boolean }) {
  return (
    <span className={cx("k-mark", on && "k-mark--on")} aria-hidden="true">
      <svg viewBox="0 0 900 600">
        <rect className="f-white" x="0" y="0" width="900" height="300" />
        <rect className="f-red" x="0" y="300" width="900" height="300" />
        <path className="f-blue" d="M0 0L450 300 0 600z" />
      </svg>
    </span>
  );
}
