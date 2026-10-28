/**
 * Zalomení textu pro canvas (Story, čtverec). Čistá funkce – měření dodá volající
 * (ctx.measureText v prohlížeči, v testech pevná šířka znaku). Nezalomitelná mezera
 * (U+00A0) drží „31 %“ a „3 poslanci“ pohromadě.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number, maxLines = Infinity): string[] {
  const words = text.trim().split(/[ \t\n]+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || measure(next) <= maxWidth) {
      cur = next;
      continue;
    }
    lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}
