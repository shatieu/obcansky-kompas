import type { ReactNode } from "react";

/** Odznak v hlavičce: celé prostředí je ukázka (DEMO_MODE / POC_MODE / STATIC_DEMO). */
export function SampleBadge({ children = "Ukázkový režim" }: { children?: ReactNode }) {
  return <span className="k-badge">{children}</span>;
}

/** Pruh nad každým blokem s ukázkovými čísly. `compact` = jeden řádek (dav: nebere výšku plátnu). */
export function SampleBanner({ title = "Ukázková data", text = "Čísla nejsou skutečná.", compact = false }: { title?: string; text?: string; compact?: boolean }) {
  return (
    <div className={compact ? "k-banner k-banner--compact" : "k-banner"} role="note">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
