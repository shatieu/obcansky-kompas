import { Info } from "lucide-react";
import { ui } from "@/lib/content";

/** Pruh „Ukázková data“ na stránkách se statistikami (DEMO_MODE / STATIC_DEMO). */
export function DemoBar() {
  return (
    <div role="note" className="border-b-2 border-ink bg-blue-tint">
      <p className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 font-semibold">
        <Info aria-hidden className="size-5 shrink-0" />
        {ui.demo.bar}
      </p>
    </div>
  );
}
