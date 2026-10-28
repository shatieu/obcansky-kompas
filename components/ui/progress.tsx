export type ProgressState = "done" | "current" | "todo" | "skipped";

const SR: Record<ProgressState, string> = { done: "hotovo", current: "právě teď", todo: "zbývá", skipped: "odpadá" };

/**
 * Segmentovaný průběh kompasu. Aktuální segment je červený – jediný červený prvek obrazovky kvízu.
 * `segments` dovoluje i stav „skipped“ (šrafa), jinak se odvodí z `current`.
 */
export function ProgressBar({
  total = 8,
  current = 1,
  label = true,
  segments,
  labelText,
  ariaLabel,
}: {
  total?: number;
  /** 1-based; 0 = žádná otázka není aktuální. */
  current?: number;
  /** Zobrazit „Otázka 3 z 8 · 03/08“. */
  label?: boolean;
  segments?: ProgressState[];
  /** Text kickeru, výchozí „Otázka {current} z {total}“. */
  labelText?: string;
  ariaLabel?: string;
}) {
  const segs: ProgressState[] =
    segments ?? Array.from({ length: total }, (_, i) => (i + 1 < current ? "done" : i + 1 === current ? "current" : "todo"));
  const n = segs.length;
  const text = labelText ?? `Otázka ${current} z ${n}`;
  return (
    <div>
      <ol className="k-progress" aria-label={ariaLabel ?? text}>
        {segs.map((s, i) => (
          <li key={i} data-s={s}>
            <span className="k-sr">{`Otázka ${i + 1}: ${SR[s]}`}</span>
          </li>
        ))}
      </ol>
      {label && current > 0 && (
        <div className="k-progress__label" aria-hidden="true">
          <span className="k-kicker">{text}</span>
          <span className="k-progress__count">
            {String(current).padStart(2, "0")}/{String(n).padStart(2, "0")}
          </span>
        </div>
      )}
    </div>
  );
}
