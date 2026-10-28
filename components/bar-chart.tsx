/**
 * Graf (SPEC §4.4): vodorovné pruhy, popisky přímo u pruhů, bez legendy, pořadí podle
 * možností (ne podle četnosti). Pod grafem vždy upozornění na nereprezentativnost (SPEC §8).
 */
export interface BarDatum {
  key: string;
  label: string;
  count: number;
}

export function BarChart({
  title,
  data,
  total,
  disclaimer,
  totalLabel,
}: {
  title: string;
  data: BarDatum[];
  total: number;
  disclaimer: string;
  totalLabel?: string;
}) {
  return (
    <figure className="border-t-2 border-ink pt-4">
      <figcaption className="text-xl font-bold">{title}</figcaption>
      {totalLabel && <p className="tabular mt-1 text-muted">{totalLabel}</p>}
      <ul className="mt-4 space-y-3">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
          return (
            <li key={d.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span>{d.label}</span>
                <span className="tabular shrink-0 font-semibold">{pct} %</span>
              </div>
              <div className="mt-1 h-3 w-full bg-blue-tint" aria-hidden>
                <div className="h-full bg-blue" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-muted">{disclaimer}</p>
    </figure>
  );
}
