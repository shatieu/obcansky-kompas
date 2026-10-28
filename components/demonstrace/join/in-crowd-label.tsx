"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { hasInCrowdHint, serverInCrowd, subscribeInCrowd } from "@/lib/demo/in-crowd";

/**
 * Popisek tlačítka „Připojit se…“, který po hydrataci přepne na „Upravit panáčka“ (a odkaz
 * rodičovského <a> na `editHref`), když má návštěvník nápovědu ok_in_crowd (lib/demo/in-crowd).
 * Jen čtení cookie, žádný požadavek – blok postoje je na /kompas (rozpočet JS). Tlačítko je
 * blokové na jeden řádek, takže změna textu nic neposune.
 */
export function InCrowdLabel({ join, edit, editHref }: { join: string; edit: string; editHref: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inCrowd = useSyncExternalStore(subscribeInCrowd, hasInCrowdHint, serverInCrowd);
  useEffect(() => {
    if (!inCrowd) return;
    const a = ref.current?.closest("a");
    if (a) a.setAttribute("href", editHref);
  }, [inCrowd, editHref]);
  return <span ref={ref}>{inCrowd ? edit : join}</span>;
}
