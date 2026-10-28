import type { ReactNode } from "react";
import { Icon } from "./icon";

/** Chyba / oznámení: text v ink + ikona + 4px linka (nikdy červeně). */
export function Notice({ children, tone = "alert", role }: { children: ReactNode; tone?: "alert" | "info"; role?: "alert" | "status" }) {
  return (
    <div role={role} className="flex items-start gap-3 border-l-4 border-ink bg-surface py-3 pl-4 pr-2 text-ink">
      <Icon name={tone === "alert" ? "alert" : "info"} className="mt-0.5" />
      <div className="text-[17px] leading-[26px]">{children}</div>
    </div>
  );
}

/** Štítek „Ukázkový režim“ (SampleBadge). */
export function PocBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-7 items-center border-2 border-ink px-2 text-[13px] font-bold uppercase leading-4 tracking-[0.08em]">
      {label}
    </span>
  );
}
