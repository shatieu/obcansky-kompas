import type { CSSProperties, ReactNode } from "react";
import { cx } from "./format";

/**
 * Vlajka – vždy 3:2, vždy celá, vždy sama (README „Vlajka“, pohyb.md).
 * Jen šířka; výška = šířka × 2/3. Obrys 1px flag-edge leží vně vlajky. Nic ji nepřekrývá.
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

/**
 * Potvrzení podpisu (pohyb.md §2): noční plocha, vlajka se rozvine za 800 ms, zpráva až POD ní.
 * `fixed` = přes celou obrazovku. `children` = akce pod zprávou (např. pokračovat).
 */
export function FlagUnfold({
  title = "Podepsáno.",
  text = "Díky. Tvůj hlas je započítaný.",
  still,
  fixed = false,
  onContinue,
  children,
  headingLevel = 2,
}: {
  title?: string;
  text?: string;
  /** Zmrazit na tomto ms (dokumentace). */
  still?: number;
  fixed?: boolean;
  /** Klepnutí kamkoli na plochu pokračuje. */
  onContinue?: () => void;
  children?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const t = still ?? null;
  const delays = t == null ? undefined : { wedge: -t, stripes: 150 - t };
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className={cx("k-unfold", "k-night", fixed && "k-unfold--fixed")} role="status" aria-live="polite" onClick={onContinue}>
      <div className="k-unfold__flag">
        <Flag unfold delays={delays} label="" />
      </div>
      <div className="k-unfold__msg" style={t == null ? undefined : { animationDelay: `${600 - t}ms`, animationPlayState: "paused" }}>
        <H className="k-h k-display">{title}</H>
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}
