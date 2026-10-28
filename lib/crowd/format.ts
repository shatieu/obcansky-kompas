/** Formátování pro dav (čeština). Čisté funkce, použitelné na serveru i v prohlížeči. */

const NB = " ";

/** 2481 → "2 481" (nezlomitelná mezera). */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
}

/** Tvar podle počtu: 1 / 2–4 / 0 a 5+. */
export function czPlural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Pořadí účastníka: index 2480 → "2 481. účastník" podle šablony "{rank}. účastník". */
export const formatRank = (index: number, template: string) => fill(template, { rank: formatCount(index + 1) });

/** "2026-10-28" → "28. 10. 2026" (nezlomitelné mezery). Neplatný vstup vrátí beze změny. */
export function formatDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return day;
  return `${Number(m[3])}.${NB}${Number(m[2])}.${NB}${m[1]}`;
}
