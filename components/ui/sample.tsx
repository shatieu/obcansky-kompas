import type { ReactNode } from "react";

/** Odznak v hlavičce: celé prostředí je ukázka (DEMO_MODE / POC_MODE / STATIC_DEMO). */
export function SampleBadge({ children = "Ukázkový režim" }: { children?: ReactNode }) {
  return <span className="k-badge">{children}</span>;
}

/** Pruh nad každým blokem s ukázkovými čísly. */
export function SampleBanner({ title = "Ukázková data", text = "Čísla nejsou skutečná." }: { title?: string; text?: string }) {
  return (
    <div className="k-banner" role="note">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
