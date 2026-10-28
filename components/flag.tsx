/**
 * Geometrie vlajky (SPEC §4.5): modrý klín do poloviny délky. Čisté SVG, bez smyčky.
 * `animate` = jednorázové vysunutí klínu a dojetí pruhů (hlavní stránka, 400–600 ms).
 */
export function Flag({ animate = false, className = "", title }: { animate?: boolean; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 90 60"
      className={`${animate ? "flag-animate" : ""} ${className}`}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      preserveAspectRatio="xMinYMid meet"
    >
      <g style={{ overflow: "hidden" }}>
        <rect className="flag-stripe" x="0" y="0" width="90" height="30" fill="#FFFFFF" />
        <rect className="flag-stripe" x="0" y="30" width="90" height="30" fill="var(--red)" />
        <polygon className="flag-wedge" points="0,0 45,30 0,60" fill="var(--blue)" />
      </g>
      <rect x="0.5" y="0.5" width="89" height="59" fill="none" stroke="var(--ink)" strokeWidth="1" />
    </svg>
  );
}

/** Tenký pruh v trikolóře při čekání nad 300 ms. */
export function WaitBar({ label }: { label: string }) {
  return (
    <div className="wait-bar flex h-1 w-full" role="progressbar" aria-label={label}>
      <span className="h-full flex-1 bg-surface outline outline-1 outline-ink/20" />
      <span className="h-full flex-1 bg-red" />
      <span className="h-full flex-1 bg-blue" />
    </div>
  );
}

/** Rozvinutí vlajky přes obrazovku (potvrzení podpisu), max. 800 ms. */
export function FlagUnfurl({ className = "" }: { className?: string }) {
  return (
    <div className={`flag-unfurl relative h-24 w-full overflow-hidden ${className}`} aria-hidden>
      <svg viewBox="0 0 90 60" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <rect x="0" y="0" width="90" height="30" fill="#FFFFFF" />
        <rect x="0" y="30" width="90" height="30" fill="var(--red)" />
        <polygon points="0,0 45,30 0,60" fill="var(--blue)" />
      </svg>
    </div>
  );
}
