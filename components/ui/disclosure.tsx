"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { cx } from "./format";
import { Icon } from "./icon";

type ForcedState = "hover" | "focus" | "active";

/**
 * Řádek „Co to znamená?“. mode="sheet" otevírá spodní panel (mobil), mode="inline" rozbalí na místě (desktop).
 */
export function Disclosure({
  label = "Co to znamená?",
  sub,
  open = false,
  mode = "sheet",
  state,
  onToggle,
  buttonRef,
  panelId,
  headingLevel,
  keepMounted = false,
  children,
}: {
  label?: string;
  /** Doplněk pod popiskem (např. název volby, ke které vysvětlivka patří). */
  sub?: ReactNode;
  open?: boolean;
  mode?: "sheet" | "inline";
  state?: ForcedState;
  onToggle?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  panelId?: string;
  /** Tlačítko obalí nadpis dané úrovně (sekce textových stránek). */
  headingLevel?: 2 | 3 | 4;
  /** Panel zůstane v DOM se `hidden` (kotvy #id uvnitř, hledání). Jen mode="inline". */
  keepMounted?: boolean;
  children?: ReactNode;
}) {
  const genId = useId();
  const id = panelId ?? genId;
  const H = headingLevel ? (`h${headingLevel}` as "h2" | "h3" | "h4") : null;
  const button = (
    <button
      ref={buttonRef}
      type="button"
      className="k-disc"
      data-state={state}
      aria-expanded={mode === "inline" ? open : undefined}
      aria-haspopup={mode === "sheet" ? "dialog" : undefined}
      aria-controls={mode === "inline" ? id : undefined}
      onClick={onToggle}
    >
      <span className="k-disc__q" aria-hidden="true">
        ?
      </span>
      <span className="k-disc__label">
        {label}
        {sub && <span className="k-disc__sub">{sub}</span>}
      </span>
      <Icon
        name={mode === "inline" ? (open ? "minus" : "plus") : "arrow-right"}
      />
    </button>
  );
  return (
    <div>
      {H ? (
        <H className="m-0 font-[inherit] text-[length:inherit]">{button}</H>
      ) : (
        button
      )}
      {mode === "inline" && (open || keepMounted) && (
        <div className="k-disc__panel" id={id} hidden={!open}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Spodní panel (mobil): scrim 160 ms, panel 240 ms. Fokus na nadpis, Escape zavře,
 * po zavření se fokus vrátí na prvek, který panel otevřel.
 * Obsah = `lines` (max. 4 krátké věty) a/nebo `children`.
 */
export function BottomSheet({
  open = true,
  title,
  lines = [],
  sources = [],
  onClose,
  fixed = false,
  closeLabel = "Zavřít",
  sourcesLabel = "Zdroje",
  children,
}: {
  open?: boolean;
  title: ReactNode;
  lines?: ReactNode[];
  sources?: { label: string; href?: string; note?: string }[];
  onClose?: () => void;
  /** V rámci rodiče (náhledy), ne přes celé okno. */
  fixed?: boolean;
  closeLabel?: string;
  sourcesLabel?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div
        className={cx("k-scrim", fixed && "k-scrim--fixed")}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cx("k-sheet", fixed && "k-sheet--fixed")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <div className="k-sheet__head">
          <h2 className="k-h k-h2" id={id} ref={titleRef} tabIndex={-1}>
            {title}
          </h2>
          <button
            type="button"
            className="k-iconbtn"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <Icon name="close" />
          </button>
        </div>
        {lines.length > 0 && (
          <ol className="k-sheet__lines">
            {lines.slice(0, 4).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        )}
        {children && <div className="k-sheet__body">{children}</div>}
        {sources.length > 0 && (
          <ul className="k-sheet__src" aria-label={sourcesLabel}>
            {sources.map((s, i) => (
              <li key={i}>
                <a
                  className="k-link"
                  href={s.href || "#"}
                  rel="noopener noreferrer"
                  target={s.href ? "_blank" : undefined}
                >
                  {s.label}
                  <Icon name="external" size={18} />
                </a>
                {s.note && <span className="k-cap"> {s.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * „Co to znamená?“ s vlastním stavem: pod 768 px otevře BottomSheet, od 768 px rozbalí na místě.
 * `children` se vykreslí v panelu i v sheetu; `onOpen` = líné načtení obsahu.
 */
export function ExplainDisclosure({
  label = "Co to znamená?",
  sub,
  title,
  closeLabel,
  onOpen,
  children,
}: {
  label?: string;
  sub?: ReactNode;
  /** Nadpis spodního panelu. */
  title: ReactNode;
  closeLabel?: string;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<false | "sheet" | "inline">(false);
  const toggle = () => {
    if (open) return setOpen(false);
    const wide =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;
    onOpen?.();
    setOpen(wide ? "inline" : "sheet");
  };
  return (
    <>
      <Disclosure
        label={label}
        sub={sub}
        mode={open === "sheet" ? "sheet" : "inline"}
        open={open === "inline"}
        onToggle={toggle}
      >
        {children}
      </Disclosure>
      <BottomSheet
        open={open === "sheet"}
        title={title}
        onClose={() => setOpen(false)}
        closeLabel={closeLabel}
      >
        {children}
      </BottomSheet>
    </>
  );
}
