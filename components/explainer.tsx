"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { ExplainerEntry } from "@/lib/content";
import { loadExplainers } from "@/lib/explainers-client";

export interface ExplainerTexts {
  open: string;
  close: string;
  pending: string;
  pro: string;
  proti: string;
  sources: string;
  loading: string;
}

/**
 * Vysvětlivka (SPEC §4.4): řádek „Co to znamená?“. Mobil = bottom sheet, desktop =
 * rozbalení na místě. Neověřené vysvětlivky ukazují „Vysvětlivka se připravuje“ (§11.3).
 */
export function Explainer({ id, texts, label }: { id: string; texts: ExplainerTexts; label?: string }) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<ExplainerEntry | undefined | null>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || entry !== null) return;
    let alive = true;
    loadExplainers()
      .then((all) => alive && setEntry(all[id]))
      .catch(() => alive && setEntry(undefined));
    return () => {
      alive = false;
    };
  }, [open, entry, id]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-2 text-left font-semibold text-blue underline underline-offset-4"
      >
        <ChevronDown aria-hidden className={`size-5 shrink-0 transition-transform transition-fast ${open ? "rotate-180" : ""}`} />
        {texts.open}
        {label && <span className="sr-only">: {label}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-ink/50 md:hidden" aria-hidden onClick={() => setOpen(false)} />
          <div
            id={panelId}
            ref={panelRef}
            tabIndex={-1}
            role="region"
            aria-label={label ? `${texts.open} ${label}` : texts.open}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto border-t-2 border-ink bg-blue-tint p-5 pb-8 md:static md:z-auto md:max-h-none md:border-t-0 md:border-l-2 md:p-4"
          >
            <div className="mb-3 flex items-start justify-between gap-3 md:hidden">
              {label && <p className="text-lg font-bold">{label}</p>}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-12 shrink-0 items-center justify-center border-2 border-ink"
                aria-label={texts.close}
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            {entry === null ? (
              <p className="text-muted">{texts.loading}</p>
            ) : !entry || entry.status !== "verified" ? (
              <p>{texts.pending}</p>
            ) : (
              <div className="space-y-3">
                <p>{entry.text}</p>
                {entry.pro && (
                  <p>
                    <strong>{texts.pro}:</strong> {entry.pro}
                  </p>
                )}
                {entry.proti && (
                  <p>
                    <strong>{texts.proti}:</strong> {entry.proti}
                  </p>
                )}
                {entry.sources.length > 0 && (
                  <div>
                    <p className="font-semibold">{texts.sources}</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {entry.sources.map((s) => (
                        <li key={s.id}>
                          <a href={s.url} rel="noopener noreferrer" target="_blank">
                            {s.title || s.url}
                          </a>
                          {s.locator && <span className="text-muted"> – {s.locator}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
