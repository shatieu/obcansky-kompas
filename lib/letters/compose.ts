import {
  LEVELS,
  POSITIONS,
  type AddresseeType,
  type Delka,
  type Forma,
  type LettersContent,
  type Position,
  type Variant,
} from "./schema";

/* -------------------------------------------------------------------- PRNG */

/** FNV-1a 32bit – stabilní hash řetězce. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 – malý deterministický PRNG, vrací čísla v [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Výběr varianty pro jednu pozici. Každá pozice má vlastní proud náhody odvozený ze
 * seedu a názvu pozice, takže zapnutí volitelného bloku nezmění ostatní pozice.
 */
function pick<T>(list: readonly T[], seed: string | number, salt: string): T {
  const rng = mulberry32(hashString(`${String(seed)}|${salt}`));
  rng(); // zahození prvního čísla zlepší rozptyl u blízkých seedů
  const item = list[Math.floor(rng() * list.length)];
  if (item === undefined) throw new Error(`Prázdný seznam variant pro „${salt}“.`);
  return item;
}

/* ------------------------------------------------------------------- types */

export interface ComposeLetterInput {
  addressee: AddresseeType;
  /** Věty z podepsaného textu (composeStatement), v pořadí. Tvoří jádro dopisu. */
  statementSentences: string[];
  forma: Forma;
  delka: Delka;
  /** Seed z URL; „Jiná varianta“ ho změní. */
  seed: string | number;
  includeProcessBlock?: boolean;
  /** Volitelná vlastní věta (prostý text). */
  customSentence?: string;
  /** Patička „Připraveno pomocí …“ – výchozí zapnuto. */
  includeFooter?: boolean;
  /** Jméno pod podpisem (volitelné). */
  senderName?: string;
}

export type LetterPartKind = Position | "jadro" | "projednavani" | "vlastni" | "podpis" | "paticka";

export interface LetterPart {
  kind: LetterPartKind;
  /** id varianty u pozic z YAML, jinak null */
  variantId: string | null;
  text: string;
}

export interface ComposedLetter {
  addressee: AddresseeType;
  addresseeLabel: string;
  forma: Forma;
  delka: Delka;
  seed: string;
  /** Odstavce v pořadí, jak jdou v dopise. */
  parts: LetterPart[];
  /** Celý dopis jako prostý text (odstavce oddělené prázdným řádkem). */
  text: string;
  /** Kombinace variant pozic, např. „osl-1/uvod-3/pre-2/zad-1/zav-4“. */
  combinationKey: string;
  contentVersion: { common: number; type: number };
}

/* ----------------------------------------------------------------- compose */

function assertLevel(name: string, v: number): asserts v is 1 | 2 | 3 {
  if (v !== 1 && v !== 2 && v !== 3) throw new Error(`${name} musí být 1, 2 nebo 3 (je ${String(v)}).`);
}

export function eligibleVariants(list: readonly Variant[], forma: Forma, delka: Delka): Variant[] {
  return list.filter((v) => v.forma.includes(forma) && v.delka.includes(delka));
}

const clean = (s: string) => s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();

/** Složí dopis. Čistá funkce: stejný vstup a obsah → stejný dopis. */
export function composeLetter(input: ComposeLetterInput, content: LettersContent): ComposedLetter {
  const { addressee, forma, delka, seed } = input;
  assertLevel("forma", forma);
  assertLevel("delka", delka);
  const type = content.types[addressee];
  if (!type) throw new Error(`Neznámý typ adresáta „${String(addressee)}“.`);

  const chosen = {} as Record<Position, Variant>;
  for (const pos of POSITIONS) {
    const list = eligibleVariants(type.positions[pos], forma, delka);
    chosen[pos] = pick(list, seed, `${addressee}|${pos}|${forma}|${delka}`);
  }

  const parts: LetterPart[] = [];
  const add = (kind: LetterPartKind, text: string, variantId: string | null = null) => {
    const t = clean(text);
    if (t) parts.push({ kind, variantId, text: t });
  };

  add("osloveni", chosen.osloveni.text, chosen.osloveni.id);
  add("uvod", chosen.uvod.text, chosen.uvod.id);
  add(
    "jadro",
    input.statementSentences
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" "),
  );
  add("prechod", chosen.prechod.text, chosen.prechod.id);
  add("zadost", chosen.zadost.text, chosen.zadost.id);
  if (input.includeProcessBlock) {
    const v = pick(eligibleVariants(content.common.process_block.variants, forma, delka), seed, `${addressee}|proces|${forma}|${delka}`);
    add("projednavani", v.text, v.id);
  }
  if (input.customSentence) add("vlastni", input.customSentence);
  add("zaver", chosen.zaver.text, chosen.zaver.id);
  if (input.senderName) add("podpis", input.senderName);
  if (input.includeFooter !== false) add("paticka", content.common.footer);

  // Podpis patří hned pod pozdrav (bez prázdného řádku).
  const blocks: string[] = [];
  for (const p of parts) {
    if (p.kind === "podpis" && blocks.length) blocks[blocks.length - 1] += `\n${p.text}`;
    else blocks.push(p.text);
  }

  return {
    addressee,
    addresseeLabel: type.label,
    forma,
    delka,
    seed: String(seed),
    parts,
    text: blocks.join("\n\n"),
    combinationKey: POSITIONS.map((p) => chosen[p].id).join("/"),
    contentVersion: { common: content.common.version, type: type.version },
  };
}

/* ------------------------------------------------------------ combinations */

/**
 * Počet různých kombinací variant pozic (oslovení × úvod × přechod × žádost × závěr).
 * Bez `forma`/`delka` součet přes všech 9 nastavení posuvníků; s nimi jen pro dané nastavení.
 * Volitelný blok o projednávání se nezapočítává.
 */
export function countCombinations(
  type: AddresseeType,
  content: LettersContent,
  only?: { forma?: Forma; delka?: Delka },
): number {
  const t = content.types[type];
  if (!t) throw new Error(`Neznámý typ adresáta „${String(type)}“.`);
  let total = 0;
  for (const f of LEVELS) {
    if (only?.forma && only.forma !== f) continue;
    for (const d of LEVELS) {
      if (only?.delka && only.delka !== d) continue;
      total += POSITIONS.reduce((acc, pos) => acc * eligibleVariants(t.positions[pos], f, d).length, 1);
    }
  }
  return total;
}
