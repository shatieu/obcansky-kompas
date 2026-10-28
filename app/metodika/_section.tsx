"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Disclosure } from "@/components/ui/disclosure";

/**
 * Sekce textové stránky za řádkem „Co to znamená?“ (components/ui Disclosure, rozbalení na místě).
 * Panel zůstává v DOM (hidden), takže kotvy #id uvnitř fungují: když adresa míří do sekce,
 * sekce se sama otevře a posune na cíl.
 */
export function Section({
  title,
  sub,
  children,
  id,
  level = 2,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  id?: string;
  level?: 2 | 3;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const reveal = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      const target = document.getElementById(hash);
      const panel = document.getElementById(panelId);
      if (!target || !panel) return;
      if (hash === id || panel.contains(target)) {
        setOpen(true);
        requestAnimationFrame(() => target.scrollIntoView());
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [id, panelId]);

  return (
    <div id={id}>
      <Disclosure
        label={title}
        sub={sub}
        mode="inline"
        open={open}
        onToggle={() => setOpen((o) => !o)}
        headingLevel={level}
        keepMounted
        panelId={panelId}
      >
        {children}
      </Disclosure>
    </div>
  );
}
