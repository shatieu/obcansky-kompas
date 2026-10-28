/**
 * Normalizace textu pro skriptovou moderaci (SPEC-demonstrace §4.1). Čistá, izomorfní
 * (server i prohlížeč), bez závislostí. Stejnou funkcí se normalizují i seznamy při
 * generování (lib/moderation/build-lists.ts), takže kmen a text jsou vždy ve stejném tvaru.
 *
 * Postup: NFKC (plnošířková a „matematická“ písmena) → malá písmena → odstranění
 * neviditelných znaků (\p{Cf}) → NFD + odstranění diakritiky → záměna podobných znaků
 * (leetspeak, cyrilice, řečtina) → sjednocení y→i, w→v, q→k → slova jen z [a-z]
 * → zkrácení opakovaných písmen.
 *
 * Znaky s dvojím čtením (1 = i/l, | = l/i, cyrilice vizuálně „р = p“ / foneticky „р = r“)
 * dávají dvě varianty textu; kontroluje se každá.
 */

/** Jednoznačné záměny (po odstranění diakritiky a převodu na malá písmena). */
const SINGLE: Record<string, string> = {
  // leetspeak a symboly
  "0": "o",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "€": "e",
  "£": "l",
  "¢": "c",
  "¥": "y",
  "+": "t",
  "©": "c",
  "®": "r",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "p",
  ı: "i",
  ĸ: "k",
  // řečtina (vizuálně podobné)
  α: "a",
  β: "b",
  γ: "y",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "n",
  θ: "o",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "u",
  ν: "v",
  ξ: "e",
  ο: "o",
  π: "n",
  ρ: "p",
  σ: "o",
  ς: "s",
  τ: "t",
  υ: "u",
  φ: "f",
  χ: "x",
  ψ: "y",
  ω: "w",
  // cyrilice – znaky se stejným vizuálním i fonetickým čtením
  а: "a",
  б: "b",
  д: "d",
  е: "e",
  з: "z",
  к: "k",
  л: "l",
  м: "m",
  о: "o",
  т: "t",
  ф: "f",
  ш: "s",
  щ: "s",
  ж: "z",
  ч: "c",
  ц: "c",
  ь: "",
  ъ: "",
  ы: "i",
  э: "e",
  ю: "u",
  я: "a",
  і: "i",
  ї: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  һ: "h",
  ӏ: "l",
  ү: "y",
  є: "e",
  ґ: "g",
};

/** Dvojznačné záměny: [varianta A (vizuální), varianta B (fonetická / druhé čtení)]. */
const DOUBLE: Record<string, [string, string]> = {
  "1": ["i", "l"],
  "!": ["i", "l"],
  "|": ["l", "i"],
  // cyrilice: vizuálně jako latinka / foneticky (курва = kypba vizuálně, kurva foneticky)
  в: ["b", "v"],
  г: ["r", "g"],
  и: ["u", "i"],
  й: ["u", "j"],
  н: ["h", "n"],
  п: ["n", "p"],
  р: ["p", "r"],
  с: ["c", "s"],
  у: ["y", "u"],
  х: ["x", "ch"],
};

/** Sjednocení písmen, která se při obcházení zaměňují (a v seznamech se tak i zapisují). */
const FOLD: Record<string, string> = { y: "i", w: "v", q: "k" };

const FORMAT_CHARS = /[\p{Cf}͏ᅟᅠㅤﾠ]/gu;
const MARKS = /\p{M}+/gu;

/** NFKC, malá písmena, bez neviditelných znaků a diakritiky. Písmena mimo latinku zůstávají. */
export function baseFold(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(FORMAT_CHARS, "").normalize("NFD").replace(MARKS, "");
}

function mapVariant(base: string, variant: 0 | 1): string {
  let out = "";
  for (const ch of base) {
    const d = DOUBLE[ch];
    let m = d ? d[variant] : (SINGLE[ch] ?? ch);
    if (m.length === 1) m = FOLD[m] ?? m;
    out += m;
  }
  return out;
}

/** Zkrátí opakovaná písmena (kuuurva → kurva). */
export function collapseRepeats(s: string): string {
  return s.replace(/([a-z])\1+/g, "$1");
}

export interface NormalizedForm {
  /** Slova jen z [a-z], se zkrácenými opakováními. */
  words: string[];
  /** Slova spojená bez oddělovačů (k.u.r.v.a → kurva); opakování zkrácená i přes hranici slov. */
  joined: string;
  /** Pro každý znak `joined` index slova, ze kterého pochází. */
  wordOf: number[];
}

function toForm(mapped: string): NormalizedForm {
  const words = (mapped.match(/[a-z]+/g) ?? []).map(collapseRepeats);
  let joined = "";
  const wordOf: number[] = [];
  words.forEach((w, wi) => {
    for (const ch of w) {
      if (joined.length > 0 && joined[joined.length - 1] === ch) continue;
      joined += ch;
      wordOf.push(wi);
    }
  });
  return { words, joined, wordOf };
}

/** Všechny varianty normalizovaného textu (1–2, duplicitní se vynechají). */
export function normalizeForms(text: string): NormalizedForm[] {
  const base = baseFold(text);
  const a = mapVariant(base, 0);
  const b = mapVariant(base, 1);
  return a === b ? [toForm(a)] : [toForm(a), toForm(b)];
}

/** Jednoduchá normalizace na jeden řetězec (seznamy, porovnání jmen): slova spojená mezerou. */
export function normalizeSimple(text: string): string {
  return toForm(mapVariant(baseFold(text), 0)).words.join(" ");
}
