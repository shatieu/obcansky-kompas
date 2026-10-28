import type { ReactNode } from "react";
import { Flag } from "./flag";
import { cx } from "./format";

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
