/**
 * Segmentovaný průběh nahoře (SPEC §4.4) v trikolóře: vyplněné segmenty modře,
 * aktuální segment s červenou linkou (jediný červený prvek obrazovky kompasu).
 */
export interface ProgressSegment {
  id: string;
  state: "done" | "skipped" | "todo";
}

export function Progress({ segments, current, label }: { segments: ProgressSegment[]; current: number; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex w-full gap-1">
      {segments.map((s, i) => (
        <span key={s.id} className="relative h-3 flex-1 bg-blue-tint" aria-hidden>
          <span
            className={`progress-fill absolute inset-0 ${s.state === "skipped" ? "hatch bg-transparent" : "bg-blue"}`}
            style={{ transform: `scaleX(${s.state === "todo" ? 0 : 1})` }}
          />
          {i === current && <span className="absolute inset-x-0 -bottom-1.5 h-1 bg-red" />}
        </span>
      ))}
    </div>
  );
}
