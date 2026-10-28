import type { ReactNode } from "react";

/** Primární akce: na mobilu přilepená dole přes celou šířku, na desktopu v toku (SPEC §4.4). */
export function StickyAction({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 border-t-2 border-ink bg-surface px-4 py-3 md:static md:mx-0 md:border-t-0 md:px-0">
      <div className="flex items-stretch gap-3">{children}</div>
    </div>
  );
}

export const buttonPrimary =
  "inline-flex min-h-14 flex-1 items-center justify-center gap-2 border-2 border-blue bg-blue px-6 text-lg font-semibold text-on-blue transition-colors transition-fast hover:bg-ink hover:border-ink disabled:opacity-50 md:flex-none";
export const buttonSecondary =
  "inline-flex min-h-14 items-center justify-center gap-2 border-2 border-ink bg-surface px-5 text-lg font-semibold text-ink transition-colors transition-fast hover:bg-blue-tint";
export const buttonLink =
  "inline-flex min-h-12 items-center gap-2 px-1 font-semibold text-blue underline underline-offset-4";
