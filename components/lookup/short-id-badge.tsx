"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/format";
import type { ShortIdTexts } from "@/lib/sign/lookup-texts";
import { formatShortId } from "@/lib/sign/short-id";

/**
 * Číslo podpisu (XXXX-XXXX) s tlačítkem Kopírovat. Na noční ploše (FlagUnfold) bere tokeny
 * `.k-night` samo. Kliknutí se nešíří dál (FlagUnfold klepnutím kamkoli pokračuje).
 */
export function ShortIdBadge({ shortId, texts, hint = true, className }: { shortId: string; texts: ShortIdTexts; hint?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const formatted = formatShortId(shortId);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
    } catch {
      /* schránka nedostupná – číslo jde opsat */
    }
  };

  return (
    <div className={cx("border-l-4 border-ink pl-2", className)} onClick={(e) => e.stopPropagation()}>
      <p className="k-cap">{texts.label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="k-stat-m k-num select-all tracking-[0.06em]" data-testid="short-id">
          {formatted}
        </span>
        <Button variant="secondary" icon="copy" className="-ml-1" onClick={copy}>
          {copied ? texts.copied : texts.copy}
        </Button>
      </div>
      {hint && <p className="k-cap mt-0.5">{texts.hint}</p>}
      <span className="k-sr" aria-live="polite">
        {copied ? texts.copied : ""}
      </span>
    </div>
  );
}
