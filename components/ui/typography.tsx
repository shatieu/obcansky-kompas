import type { ReactNode, Ref } from "react";
import { cx } from "./format";
import { Icon } from "./icon";

/** Kicker: VELKÁ písmena, wide 700, 13/16, se 4px linkou. */
export function Kicker({ children, className, as: Tag = "p" }: { children: ReactNode; className?: string; as?: "p" | "span" | "div" }) {
  return <Tag className={cx("k-kicker", className)}>{children}</Tag>;
}

/**
 * Nadpis obrazovky: kicker (nepovinný) + h1 + nejvýš jedna krátká věta.
 * `level="display"` = plakátový nadpis (hlavní stránka, noční plocha).
 */
export function ScreenHeading({
  kicker,
  title,
  lead,
  level = "h1",
  id,
  headingRef,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  level?: "h1" | "display";
  id?: string;
  /** Ref pro přesun fokusu (nadpis pak dostane tabIndex -1). */
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}) {
  return (
    <header className={className}>
      {kicker && <Kicker>{kicker}</Kicker>}
      <h1 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={cx("k-h", level === "display" ? "k-display" : "k-h1", "outline-none")}>
        {title}
      </h1>
      {lead && <p className="k-lede">{lead}</p>}
    </header>
  );
}

export function SectionTitle({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cx("k-h k-h2", className)}>
      {children}
    </h2>
  );
}

/** Chyba = ink text + ikona alert + 4px ink linka (nikdy červeně). `tone="info"` = stejný tvar s ikonou info. */
export function Notice({
  children,
  tone = "alert",
  role,
  className,
}: {
  children: ReactNode;
  tone?: "alert" | "info";
  role?: "alert" | "status" | "note";
  className?: string;
}) {
  return (
    <div role={role} className={cx("k-error", className)}>
      <Icon name={tone === "alert" ? "alert" : "info"} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
