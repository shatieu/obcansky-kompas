/** Pomůcky pro kontrolu délek textu (SPEC §4.1). Čisté funkce, sdílené lint:content a testy. */

const ABBREVIATIONS = ["např", "tzv", "tj", "mld", "mil", "resp", "č", "odst", "str", "s", "sb", "kč", "atd", "apod", "mj", "zejm", "tis"];

/** Slovo = token obsahující písmeno nebo číslici („–“, „%“, „+“ samostatně se nepočítají). */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Rozdělí text na věty. Tečka za zkratkou nebo před číslicí větu neukončí. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let start = 0;
  const re = /[.!?…]+(?=\s+[\p{Lu}„"])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const before = clean.slice(start, m.index);
    const lastWord = (before.split(/\s+/).pop() ?? "").toLowerCase().replace(/[^\p{L}]/gu, "");
    if (m[0] === "." && ABBREVIATIONS.includes(lastWord)) continue;
    out.push(clean.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  const rest = clean.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

export interface BannedTerm {
  term: string;
  replacement?: string;
}

/** Najde zakázané výrazy (i ohnuté tvary: shoda na začátku slova s kmenem výrazu). */
export function findBannedTerms(text: string, terms: BannedTerm[]): BannedTerm[] {
  const lower = text.toLowerCase();
  return terms.filter(({ term }) => {
    const words = term.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const pattern = words
      .map((w) => {
        const stem = w.length > 5 ? w.slice(0, w.length - 2) : w;
        return `${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\p{L}]*`;
      })
      .join("\\s+");
    return new RegExp(`(?<![\\p{L}])${pattern}`, "u").test(lower);
  });
}
