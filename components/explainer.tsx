"use client";

import { useEffect, useState } from "react";
import type { ExplainerEntry } from "@/lib/content";
import { loadExplainers } from "@/lib/explainers-client";
import { Icon } from "@/components/ui/icon";

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
 * Obsah vysvětlivky (SPEC §4.4, §11.3). Data se načtou až při prvním otevření (samostatný chunk).
 * Neověřené vysvětlivky ukazují „Vysvětlivka se připravuje“. Obal (spodní panel na mobilu,
 * rozbalení na místě na desktopu) dodává volající přes components/ui/disclosure.
 */
export function ExplainerBody({ id, texts }: { id: string; texts: ExplainerTexts }) {
  const [entry, setEntry] = useState<ExplainerEntry | undefined | null>(null);

  useEffect(() => {
    let alive = true;
    loadExplainers()
      .then((all) => alive && setEntry(all[id]))
      .catch(() => alive && setEntry(undefined));
    return () => {
      alive = false;
    };
  }, [id]);

  if (entry === null) return <p className="text-ink-secondary">{texts.loading}</p>;
  if (!entry || entry.status !== "verified") return <p>{texts.pending}</p>;
  return (
    <div className="space-y-1.5">
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
          <ul>
            {entry.sources.map((s) => (
              <li key={s.id}>
                <a className="k-link" href={s.url} rel="noopener noreferrer" target="_blank">
                  {s.title || s.url}
                  <Icon name="external" size={18} />
                </a>
                {s.locator && <span className="k-cap"> {s.locator}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
