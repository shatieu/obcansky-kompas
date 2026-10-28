import { formatCz, NB } from "./format";

export interface BarChartDatum {
  label: string;
  value: number;
  /** Stabilní klíč (jinak label). */
  key?: string;
}

/**
 * Graf: jedna barva (blue), popisky přímo na pruzích, pořadí podle možností (ne podle velikosti),
 * žádná legenda, žádné zvýraznění „naší“ odpovědi.
 */
export function BarChart({
  title,
  data = [],
  total,
  unit = "%",
  foot,
  headingLevel = 3,
  lede,
}: {
  title?: string;
  /** V pořadí odpovědí. */
  data: BarChartDatum[];
  total?: number;
  unit?: string;
  foot?: string;
  headingLevel?: 2 | 3 | 4;
  /** Řádek pod nadpisem (např. počet odpovědí). */
  lede?: string;
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const sum = total || data.reduce((a, d) => a + d.value, 0);
  const maxV = Math.max(1, ...data.map((x) => x.value));
  return (
    <figure className="k-chart">
      {title && <H className="k-chart__title">{title}</H>}
      {lede && <p className="k-cap -mt-1 mb-2 k-num">{lede}</p>}
      <ol className="k-chart__list">
        {data.map((d) => {
          const p = unit === "%" ? (sum > 0 ? Math.round((d.value / sum) * 100) : 0) : d.value;
          const w = unit === "%" ? p : (d.value / maxV) * 100;
          const txt = (
            <>
              <span>{d.label}</span>
              <span className="k-bar__val">
                {formatCz(p)}
                {NB}
                {unit}
              </span>
            </>
          );
          return (
            <li key={d.key ?? d.label} className="k-bar">
              <span className="k-bar__fill" style={{ width: `${w}%` }} />
              <span className="k-bar__text">{txt}</span>
              <span className="k-bar__text k-bar__text--on" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - w}% 0 0)` }}>
                {txt}
              </span>
            </li>
          );
        })}
      </ol>
      {foot && <figcaption className="k-chart__foot">{foot}</figcaption>}
    </figure>
  );
}
