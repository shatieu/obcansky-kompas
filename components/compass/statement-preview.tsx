"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ui } from "@/lib/content";
import type { Statement } from "@/lib/compose";

/** Živý náhled „Můj text“ (SPEC §6): mobil sbalený, desktop vedlejší sloupec. */
export function StatementPreview({
  statement,
  hideUnknown,
  onToggleHide,
  collapsible = false,
}: {
  statement: Statement;
  hideUnknown: boolean;
  onToggleHide: (v: boolean) => void;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const hasAnswers = statement.parts.some((p) => p.questionId !== null);
  const body = (
    <div id={id} className="bg-blue-tint p-4">
      {hasAnswers ? <p>{statement.text}</p> : <p className="text-muted">{ui.preview.empty}</p>}
      <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={hideUnknown}
          onChange={(e) => onToggleHide(e.target.checked)}
          className="size-5 accent-[var(--blue)]"
        />
        {ui.preview.hide_nevim}
      </label>
    </div>
  );
  if (!collapsible)
    return (
      <section aria-labelledby={`${id}-h`} className="border-t-2 border-ink pt-3">
        <h2 id={`${id}-h`} className="mb-3 text-xl font-bold">
          {ui.preview.title}
        </h2>
        {body}
      </section>
    );
  return (
    <section className="mb-6 border-y-2 border-ink">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-2 font-semibold"
      >
        <span>{ui.preview.title}</span>
        <span className="flex items-center gap-1 text-blue">
          {open ? ui.preview.hide_button : ui.preview.show_button}
          <ChevronDown aria-hidden className={`size-5 transition-transform transition-fast ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && <div className="pb-3">{body}</div>}
    </section>
  );
}
