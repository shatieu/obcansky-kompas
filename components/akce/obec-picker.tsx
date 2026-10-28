"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { DirObec } from "@/lib/export/recipients";
import { searchObce, type SavedObec } from "./state";
import { fill, type AkceTexts } from "./texts";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/typography";

/** Obce se stahují po krajích a jen jednou za načtení stránky. */
const cache = new Map<string, Promise<DirObec[]>>();
function loadObce(kraj: string): Promise<DirObec[]> {
  let p = cache.get(kraj);
  if (!p) {
    p = fetch(`/akce/data/obce/${encodeURIComponent(kraj)}`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<DirObec[]>;
    });
    p.catch(() => cache.delete(kraj));
    cache.set(kraj, p);
  }
  return p;
}

/** Vyhledání obce (combobox). Seznam obcí kraje se stáhne až při psaní. Rodič dává `key={kraj}`. */
export function ObecPicker({
  kraj,
  texts,
  value,
  onChange,
}: {
  kraj: string;
  texts: AkceTexts;
  value: SavedObec | null;
  onChange: (obec: SavedObec | null) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [list, setList] = useState<DirObec[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ensureLoaded = () => {
    if (list || status === "loading") return;
    setStatus("loading");
    loadObce(kraj).then(
      (l) => {
        setList(l);
        setStatus("idle");
      },
      () => setStatus("error"),
    );
  };

  const results = useMemo(() => (list ? searchObce(list, query) : []), [list, query]);

  if (value) {
    return (
      <div className="k-field">
        <p className="k-field__label">{texts.obec_label}</p>
        <div className="flex min-h-answer flex-wrap items-center justify-between gap-x-2 border-2 border-ink py-1 pr-1 pl-2">
          <span className="font-semibold">{fill(texts.obec_result, { name: value.nazev, okres: value.okres })}</span>
          <Button
            variant="secondary"
            onClick={() => {
              onChange(null);
              setQuery("");
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            {texts.obec_change_button}
          </Button>
        </div>
      </div>
    );
  }

  const choose = (o: DirObec) => {
    onChange({ kod: o.kod, nazev: o.nazev, okres: o.okres, kraj_code: o.kraj_code, senatni_obvod: o.senatni_obvod, urad: o.urad, casti: o.casti });
    setOpen(false);
  };
  const listId = `${id}-list`;
  const showList = open && query.trim().length > 0 && status !== "error";

  return (
    <div className="k-field relative">
      <label htmlFor={id} className="k-field__label">
        {texts.obec_label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${id}-opt-${results[active].kod}` : undefined}
        placeholder={texts.obec_placeholder}
        value={query}
        className="k-input"
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onChange={(e) => {
          ensureLoaded();
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {status === "error" && (
        <div>
          <Notice role="alert">{texts.obec_error}</Notice>
          <Button
            variant="secondary"
            onClick={() => {
              setStatus("idle");
              setTimeout(ensureLoaded, 0);
            }}
          >
            {texts.obec_retry_button}
          </Button>
        </div>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {status === "loading" ? texts.obec_loading : showList && list && results.length === 0 ? texts.obec_none : ""}
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label={texts.obec_label} className="absolute top-full right-0 left-0 z-40 border-2 border-t-0 border-ink bg-surface">
          {status === "loading" && <li className="min-h-target px-2 py-1.5 text-ink-secondary">{texts.obec_loading}</li>}
          {list && results.length === 0 && <li className="min-h-target px-2 py-1.5">{texts.obec_none}</li>}
          {results.map((o, i) => (
            <li
              key={o.kod}
              id={`${id}-opt-${o.kod}`}
              role="option"
              aria-selected={i === active}
              className={`flex min-h-target cursor-pointer items-center px-2 py-1 ${i === active ? "bg-blue text-on-blue" : "hover:bg-blue-tint"}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              <span>
                <span className="font-semibold">{o.nazev}</span>
                <span className="text-caption">{` · ${o.okres}`}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
