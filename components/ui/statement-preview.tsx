"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "./icon";

/**
 * „Můj text“: sbalený řádek s náhledem první věty (mobil, nad tlačítkem), po rozbalení celý text.
 * `paragraphs` jsou prostý text; zvýraznění odpovědí jde přes `children`.
 */
export function StatementPreview({
  open: openIn = false,
  paragraphs = [],
  label = "Můj text",
  peek: peekIn,
  onToggle,
  children,
}: {
  open?: boolean;
  paragraphs?: string[];
  label?: string;
  /** Text v sbaleném řádku (jinak první odstavec). */
  peek?: string;
  onToggle?: (open: boolean) => void;
  /** Obsah po rozbalení navíc (např. přepínač). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(openIn);
  const id = useId();
  const peek = peekIn ?? paragraphs[0] ?? "";
  return (
    <div className="k-mytext">
      <button
        type="button"
        className="k-mytext__row"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          onToggle?.(!open);
        }}
      >
        <span className="k-mytext__k">{label}</span>
        {!open ? <span className="k-mytext__peek">{peek}</span> : <span className="flex-1" />}
        <Icon name={open ? "minus" : "plus"} />
      </button>
      {open && (
        <div className="k-mytext__body" id={id}>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}
