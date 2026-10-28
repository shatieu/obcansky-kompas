/** Spojí třídy, prázdné hodnoty vynechá. */
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/** Nezlomitelná mezera (české typografické mezery v číslech a jednotkách). */
export const NB = " ";

/** Czech number: 12480 → "12 480", (9.2, 1) → "9,2" */
export function formatCz(n: number, digits = 0): string {
  const s = Number(n).toFixed(digits).split(".");
  s[0] = s[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  return s.join(",");
}
