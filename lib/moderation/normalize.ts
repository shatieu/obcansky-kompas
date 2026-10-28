/**
 * Normalizace textu pro skriptovou moderaci (SPEC-demonstrace §4.1). Čistá, izomorfní
 * (server i prohlížeč), bez závislostí. Stejnou funkcí se normalizují i seznamy při
 * generování (lib/moderation/build-lists.ts), takže kmen a text jsou vždy ve stejném tvaru.
 *
 * Postup: NFKC (plnošířková, „matematická“, kroužková a čtverečková písmena) → malá písmena
 * → odstranění neviditelných znaků (\p{Cf}) → NFD + odstranění diakritiky → záměna podobných
 * znaků (leetspeak, cyrilice, řečtina, kapitálky a IPA, záporně kroužková/čtverečková písmena
 * 🅐 🅰, regionální indikátory 🇦 → písmena) → sjednocení y→i, w→v, q→k → slova jen z [a-z]
 * → zkrácení opakovaných písmen.
 *
 * Znaky s dvojím čtením (1 = i/l, | = l/i, cyrilice vizuálně „р = p“ / foneticky „р = r“)
 * dávají víc variant textu; kontroluje se každá kombinace čtení (viz normalizeForms, max. 64
 * variant na celý text, jinak 64 na slovo).
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

/**
 * Latinské „dvojníky“ mimo NFKC (confusables skeleton): kapitálky (ᴀ–ᴢ), IPA a rozšířená
 * latinka (ɡ ʀ ɴ ʟ ɪ ɑ ɛ …). Řetězec dvojic „znak, písmeno“ – kvůli velikosti JS v prohlížeči.
 */
const CONFUSABLE_PAIRS =
  "ᴀaʙbᴄcᴅdᴇeꜰfɢgʜhɪiᴊjᴋkʟlᴍmɴnᴏoᴘpꞯqʀrꜱsᴛtᴜuᴠvᴡwʏyᴢzᴎnᴙrᴚrᴝmᴞmᴟmᴦrᴧlᴨnᴩpᴪy" +
  "ɡgɑaɐaɒoɔoəeɘeɛeɜeɞeɤyɨiɩiɫlɬlɭlɮlɯmɰmɱmɲnɳnɵoɶoɷoɸfɹrɺrɻrɼrɽrɾrɿrʁrʂsʃsʄjʅlʆsʇtʈtʉuʊuʋvʌvʍwʎyʐzʑzʒzʓzʔoʗcʘoʙbʛgʜhʝjʞkʠqʡoʢo" +
  "ȷjɟjƀbɓbƃbƅbƈcɗdɖdƌdƒfɠgɦhħhƙkƚlƞnƥpƭtƫtⱱvƴyȥzƶzɀzꞵbʋvɕcɧhȴlȵnȶtƪsƨsƽsꜳaꝏoꝡvꝩvꝭiꞁlꞃrꞅsꞇtꞑnꞓcꞔcꞕhꞗbꞙfꞛvꞝvꞟuꞡgꞣkꞥnꞧrꞩsꞵbꞷoꞹuꟺmꬰaꬱaꬲeꬳeꬴeꬵfꬶgꬷlꬸlꬹlꬺmꬻnꬼnꬽoꬾoꬿoꭀoꭁoꭂoꭃoꭄoꭅrꭆrꭇrꭈrꭉrꭊrꭋrꭌrꭍrꭎuꭏuꭐuꭑuꭒuꭓxꭔxꭕxꭖxꭗxꭘxꭙxꭚyꭜhꭝlꭞlꭟuꭠyꭡiꭢoꭣuꭤa";
let confusable: Map<string, string> | null = null;
function confusableOf(ch: string): string | undefined {
  if (!confusable) {
    confusable = new Map();
    const cps = Array.from(CONFUSABLE_PAIRS);
    for (let i = 0; i + 1 < cps.length; i += 2) confusable.set(cps[i]!, cps[i + 1]!);
  }
  return confusable.get(ch);
}

/**
 * Písmena A–Z jako symboly bez rozkladu NFKC: záporně kroužková 🅐, záporně čtverečková 🅰,
 * regionální indikátory 🇦 (vlajky); pro jistotu i čtverečková 🄰 a kroužková Ⓐ ⓐ.
 */
const LETTER_BLOCKS = [0x1f130, 0x1f150, 0x1f170, 0x1f1e6, 0x24b6, 0x24d0];
function letterSymbolOf(ch: string): string | undefined {
  const cp = ch.codePointAt(0)!;
  for (const b of LETTER_BLOCKS) if (cp >= b && cp < b + 26) return String.fromCharCode(97 + cp - b);
  return undefined;
}

const FORMAT_CHARS = /[\p{Cf}͏ᅟᅠㅤﾠ]/gu;
const MARKS = /\p{M}+/gu;

/** NFKC, malá písmena, bez neviditelných znaků a diakritiky. Písmena mimo latinku zůstávají. */
export function baseFold(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(FORMAT_CHARS, "").normalize("NFD").replace(MARKS, "");
}

const fold = (m: string) => (m.length === 1 ? (FOLD[m] ?? m) : m);

/** Možná čtení jednoho znaku (1 nebo 2). */
function readings(ch: string): readonly string[] {
  const d = DOUBLE[ch];
  if (d) return d[0] === d[1] ? [fold(d[0])] : [fold(d[0]), fold(d[1])];
  return [fold(SINGLE[ch] ?? confusableOf(ch) ?? letterSymbolOf(ch) ?? ch)];
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

/** Max. počet variant: na celý text, a když je kombinací víc, na každé slovo zvlášť. */
export const MAX_VARIANTS = 64;
const MAX_BITS = 6; // 2^6 = 64

/** Pevná volba čtení: `pick(i)` = 0/1 pro dvojznačný znak na pozici i. */
function build(opts: readonly (readonly string[])[], from: number, to: number, pick: (i: number) => number): string {
  let out = "";
  for (let i = from; i < to; i++) {
    const o = opts[i]!;
    out += o.length > 1 ? o[pick(i)]! : o[0]!;
  }
  return out;
}

/** Všechny kombinace čtení dvojznačných pozic `amb` v úseku [from, to) (max. 64; další pozice následují poslední bit). */
function combos(opts: readonly (readonly string[])[], from: number, to: number, amb: number[], add: (s: string) => void): void {
  const bits = Math.min(amb.length, MAX_BITS);
  const bitOf = new Map(amb.map((p, k) => [p, Math.min(k, bits - 1)]));
  for (let m = 0; m < 1 << bits; m++) add(build(opts, from, to, (i) => (m >> (bitOf.get(i) ?? 0)) & 1));
}

/**
 * Varianty normalizovaného textu. Když je kombinací dvojznačných znaků nejvýš 64, vrátí
 * všechny (přesně, i pro shody přes hranici slov). Jinak: celý text ve dvou jednotných čteních
 * (vizuální / fonetické) + každé slovo (úsek mezi mezerami) zvlášť ve všech kombinacích (max. 64).
 * První varianta je vždy vizuální čtení celého textu.
 */
export function normalizeForms(text: string): NormalizedForm[] {
  const chars = Array.from(baseFold(text));
  const opts = chars.map(readings);
  const out = new Map<string, NormalizedForm>();
  const add = (s: string) => {
    if (!out.has(s)) out.set(s, toForm(s));
  };
  const n = opts.length;
  const amb: number[] = [];
  opts.forEach((o, i) => o.length > 1 && amb.push(i));
  add(build(opts, 0, n, () => 0));
  if (!amb.length) return [...out.values()];
  if (amb.length <= MAX_BITS) {
    combos(opts, 0, n, amb, add);
    return [...out.values()];
  }
  add(build(opts, 0, n, () => 1));
  let s = 0;
  while (s < n) {
    while (s < n && /\s/u.test(chars[s]!)) s++;
    let e = s;
    while (e < n && !/\s/u.test(chars[e]!)) e++;
    const local = amb.filter((p) => p >= s && p < e);
    if (local.length) combos(opts, s, e, local, add);
    s = e;
  }
  return [...out.values()];
}

/** Jednoduchá normalizace na jeden řetězec (seznamy, porovnání jmen): slova spojená mezerou. */
export function normalizeSimple(text: string): string {
  const chars = Array.from(baseFold(text));
  return toForm(build(chars.map(readings), 0, chars.length, () => 0)).words.join(" ");
}
