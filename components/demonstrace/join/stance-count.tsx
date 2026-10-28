"use client";

import { useEffect, useState } from "react";

/**
 * Živý počet účastníků online demonstrace v bloku „Kde stojíme my“. Klient si vezme
 * /api/demonstrace/meta (CDN cache 30 s). Řádek má rezervovanou výšku od prvního vykreslení,
 * takže se po načtení nic neposune (bez CLS). Bez dat zůstane prázdný řádek.
 * Záměrně bez importů z lib/demo a lib/crowd – blok je na hlavní stránce, musí zůstat lehký.
 */
export interface StanceCountTexts {
  one: string;
  few: string;
  many: string;
  zero: string;
}

const NB = " ";
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB);

export function countLine(n: number, t: StanceCountTexts): string {
  if (n <= 0) return t.zero;
  const tpl = n === 1 ? t.one : n <= 4 ? t.few : t.many;
  return tpl.replace("{count}", fmt(n));
}

export function StanceCount({ texts }: { texts: StanceCountTexts }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/demonstrace/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { count?: unknown } | null) => {
        if (!off && typeof m?.count === "number") setLine(countLine(m.count, texts));
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [texts]);
  return (
    <span className="block min-h-[24px] min-w-[48px] font-semibold" aria-live="polite">
      {line ?? NB}
    </span>
  );
}
