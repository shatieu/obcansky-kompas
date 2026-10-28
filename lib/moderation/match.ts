import { normalizeForms, type NormalizedForm } from "./normalize";

/**
 * Hledání zakázaných kmenů v normalizovaném textu (SPEC-demonstrace §4.1). Čisté, izomorfní.
 *
 * Seznam je řetězec kmenů oddělených „|“ (viz lists.generated.ts), u kmene předpona
 *   „=“ = jen celé slovo, „^“ = jen začátek slova, bez předpony = kdekoli jako podřetězec.
 *
 * Kontroluje se:
 *  1. každé slovo zvlášť (podřetězec / začátek / celé slovo),
 *  2. text spojený bez oddělovačů (k u r v a, k.r.e.t.e.n, kur-va). Shoda přes hranici slov
 *     platí, jen když začíná na začátku slova (jinak by „pak urvat“ obsahovalo „kurv“) a kmen
 *     má aspoň 4 písmena, nebo jsou všechna dotčená slova jednopísmenná (m r d).
 * Shoda se ignoruje, když leží celá uvnitř výskytu slova z allowlistu (špička, sranda …).
 */

const Mode = { Sub: 0, Start: 1, Word: 2 } as const;
type Mode = (typeof Mode)[keyof typeof Mode];
export interface Entry {
  s: string;
  mode: Mode;
}

export function parseList(packed: string): Entry[] {
  if (!packed) return [];
  return packed.split("|").map((raw) => {
    if (raw.startsWith("=")) return { s: raw.slice(1), mode: Mode.Word };
    if (raw.startsWith("^")) return { s: raw.slice(1), mode: Mode.Start };
    return { s: raw, mode: Mode.Sub };
  });
}

export interface CompiledLists {
  block: Entry[];
  allow: Entry[];
}

function* occurrences(hay: string, needle: string): Generator<number> {
  if (!needle) return;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    yield i;
    i = hay.indexOf(needle, i + 1);
  }
}

/** Je úsek [s, e) slova `w` pokrytý výskytem některého slova z allowlistu? */
function allowedInWord(w: string, s: number, e: number, allow: Entry[]): boolean {
  for (const a of allow) {
    if (a.s.length < e - s) continue;
    if (a.mode === Mode.Word) {
      if (w === a.s) return true;
      continue;
    }
    for (const j of occurrences(w, a.s)) {
      if (a.mode === Mode.Start && j !== 0) continue;
      if (j <= s && j + a.s.length >= e) return true;
    }
  }
  return false;
}

function hitInWords(words: string[], lists: CompiledLists): boolean {
  for (const w of words) {
    for (const b of lists.block) {
      if (b.mode === Mode.Word) {
        if (w === b.s && !allowedInWord(w, 0, w.length, lists.allow)) return true;
        continue;
      }
      for (const i of occurrences(w, b.s)) {
        if (b.mode === Mode.Start && i !== 0) continue;
        if (!allowedInWord(w, i, i + b.s.length, lists.allow)) return true;
      }
    }
  }
  return false;
}

function hitAcrossWords(form: NormalizedForm, lists: CompiledLists): boolean {
  const { joined, wordOf, words } = form;
  if (words.length < 2) return false;
  const start = new Map<number, number>();
  const end = new Map<number, number>();
  wordOf.forEach((wi, idx) => {
    if (!start.has(wi)) start.set(wi, idx);
    end.set(wi, idx + 1);
  });
  for (const b of lists.block) {
    for (const i of occurrences(joined, b.s)) {
      const e = i + b.s.length;
      const first = wordOf[i]!;
      const last = wordOf[e - 1]!;
      if (first === last) continue; // uvnitř jednoho slova – řeší hitInWords
      if (start.get(first) !== i) continue;
      if (b.mode === Mode.Word && end.get(last) !== e) continue;
      if (b.s.length < 4) {
        let allSingle = true;
        for (let k = first; k <= last; k++) if ((words[k]?.length ?? 0) > 1) allSingle = false;
        if (!allSingle) continue;
      }
      // allowlist přes spojený text: shoda uvnitř výskytu povoleného slova se ignoruje
      let allowed = false;
      for (const a of lists.allow) {
        for (const j of occurrences(joined, a.s)) {
          if (j <= i && j + a.s.length >= e) {
            allowed = true;
            break;
          }
        }
        if (allowed) break;
      }
      if (!allowed) return true;
    }
  }
  return false;
}

/** Obsahuje text zakázaný kmen (v kterékoli variantě normalizace)? */
export function containsBlocked(text: string, lists: CompiledLists): boolean {
  for (const form of normalizeForms(text)) {
    if (hitInWords(form.words, lists) || hitAcrossWords(form, lists)) return true;
  }
  return false;
}
