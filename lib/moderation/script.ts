import { ALLOW, BLOCK, PUBLIC_NAMES } from "./lists.generated";
import { containsBlocked, parseList, type CompiledLists } from "./match";
import { baseFold, normalizeSimple } from "./normalize";

/**
 * Stupeň 1 moderace: skript (SPEC-demonstrace §4.1). Čistá, izomorfní funkce – stejná na
 * serveru (rozhoduje) i v prohlížeči (okamžitá zpětná vazba). Neříká důvod odmítnutí, aby
 * nešlo filtr obcházet zkoušením; hláška je v content/ui.yaml.
 *
 * Import do klienta: `import { scriptCheck } from "@/lib/moderation/script"` (nic serverového).
 */

export type ModerationField = "slogan" | "name";
/**
 * `review: true` = text prošel, ale obsahuje písmena mimo latinku, cyrilici a řečtinu – skript
 * ho neumí posoudit, rozhodne AI (stupeň 2). Vrací se jen s `{ ai: true }`; bez AI se odmítne.
 */
export type ScriptResult = { ok: true; text: string; review?: true } | { ok: false };

export interface ScriptOptions {
  /** AI kontrola zapnutá (server: aiEnabled()). Prohlížeč ji nezná → přísnější výchozí `false`. */
  ai?: boolean;
}

export const SLOGAN_MIN = 3;
export const SLOGAN_MAX = 40;
export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const MAX_EMOJI = 2;

let compiled: CompiledLists | null = null;
let names: Set<string> | null = null;
function lists(): CompiledLists {
  compiled ??= { block: parseList(BLOCK), allow: parseList(ALLOW) };
  return compiled;
}
function publicNames(): Set<string> {
  names ??= new Set(PUBLIC_NAMES ? PUBLIC_NAMES.split("|") : []);
  return names;
}

const len = (s: string) => Array.from(s).length;

/** Odstraní řídicí a neviditelné znaky (kromě ZWJ v emoji) a sjednotí mezery. */
export function cleanText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/(?!‍)\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/gu;
export function countEmoji(text: string): number {
  return text.match(EMOJI)?.length ?? 0;
}

const TLD =
  "cz|sk|com|net|org|eu|info|io|me|tv|biz|xyz|online|shop|app|dev|ru|de|at|pl|ua|uk|us|co|to|gg|ly|link|site|top|club|store|live|news|blog|cc|fm|ai";
const URLISH = new RegExp(
  [
    String.raw`https?:`,
    String.raw`:\/\/`,
    String.raw`\bwww\b`,
    // doména: slovo.tld (bez mezer kolem tečky, aby „Dost. To stačí“ nebylo odkazem)
    String.raw`[a-z0-9-]{2,}\.(?:${TLD})\b`,
    // zastřená tečka: „seznam tečka cz“, „seznam (dot) com“, „seznam[.]cz“
    String.raw`[a-z0-9-]{2,}\s*(?:\(\s*(?:\.|tecka|dot)\s*\)|\[\s*(?:\.|tecka|dot)\s*\]|\s(?:tecka|dot)\s)\s*(?:${TLD})\b`,
  ].join("|"),
);
const EMAIL = /[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+\s*\.\s*[a-z]{2,}/;
const HANDLE = /(?:^|[^\p{L}\p{N}])@[\p{L}\p{N}_]/u;
const HASHTAG = /(?:^|[^\p{L}\p{N}&])#[\p{L}\p{N}_]/u;

/** Odkazy, e-maily, telefonní čísla, @přezdívky a #hashtagy (§4.1). */
export function hasContactOrLink(text: string): boolean {
  const t = baseFold(text);
  if (URLISH.test(t) || EMAIL.test(t) || HANDLE.test(t) || HASHTAG.test(t)) return true;
  if (/(?:\+|\b00)\s*\d{3}/.test(t)) return true; // mezinárodní předvolba (+420, 00421)
  // 9 a více číslic za sebou (i s mezerami, tečkami, pomlčkami) = telefon; kulatá čísla
  // („1 000 000 000“) ne – končí na 000.
  const digits = t.replace(/(\d)[\s.\-/()]+(?=\d)/g, "$1").match(/\d{9,}/g) ?? [];
  return digits.some((d) => !/000$/.test(d));
}

/** Text s víc než 50 % velkých písmen → velké jen první písmeno věty (§4.1). */
export function fixShouting(text: string): string {
  const upper = text.match(/\p{Lu}/gu)?.length ?? 0;
  const lower = text.match(/\p{Ll}/gu)?.length ?? 0;
  if (upper + lower === 0 || upper / (upper + lower) <= 0.5) return text;
  return text
    .toLocaleLowerCase("cs")
    .replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase("cs"))
    .replace(/^(\P{L}*)(\p{Ll})/u, (_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase("cs"));
}

const NAME_RE = /^\p{Script=Latin}+(?:-\p{Script=Latin}+)*$/u;

/**
 * Písmena jako symboly (obcházení filtru, běžný text je nepotřebuje): IPA a kapitálky
 * (ɢ ʀ ɴ ʟ ɪ, ᴀ–ᴢ), fonetická rozšíření, latinka rozšířená D/E (ꜰ ꜱ ꭓ), plnošířková písmena,
 * matematická písmena (𝐀), kroužková a čtverečková písmena (Ⓐ 🄰 🅐 🅰) a písmena z bloku
 * Letterlike Symbols (ℂ ℍ ℓ). Regionální indikátory (🇦) řeší zvlášť hasLetterSymbols.
 */
const LETTERLIKE =
  /[ɐ-ʯᴀ-ᶿ꜠-ꟿꬰ-꭯Ａ-Ｚａ-ｚ①-⓿\u{1d400}-\u{1d7ff}\u{1f100}-\u{1f1e5}]|(?=\p{L})[℀-⅏]/u;
const RI = /\p{Regional_Indicator}/gu;
/** Jediná vlajka (dva indikátory) stojící samostatně – ne přilepená k písmenům nebo číslicím. */
const LONE_FLAG = /(?:^|[^\p{L}\p{N}])\p{Regional_Indicator}{2}(?:$|[^\p{L}\p{N}\p{Regional_Indicator}])/u;

/**
 * Obsahuje text písmena jako symboly nebo regionální indikátory skládající písmena (🇰🇺🇷🇻🇦)?
 * Povolená je nejvýš jedna samostatná vlajka (🇨🇿, 🇺🇦) – i ta se ale v normalizaci čte jako
 * písmena, takže přilepená ke slovu neprojde blocklistem.
 */
export function hasLetterSymbols(text: string): boolean {
  const ri = text.match(RI)?.length ?? 0;
  if (ri > 0 && !(ri === 2 && LONE_FLAG.test(text))) return true;
  return LETTERLIKE.test(text);
}

/** Písmeno mimo latinku, cyrilici a řečtinu (normalizace ho nepřevede, blocklist ho nevidí). */
const FOREIGN = /[^\P{L}\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u;
export function hasForeignLetters(text: string): boolean {
  return FOREIGN.test(text);
}

/** Je jméno na seznamu veřejně známých osob (normalizovaně, i každá část se spojovníkem)? */
export function isPublicName(name: string): boolean {
  const set = publicNames();
  const whole = normalizeSimple(name).replace(/ /g, "");
  if (set.has(whole)) return true;
  return name.split("-").some((part) => set.has(normalizeSimple(part).replace(/ /g, "")));
}

/** Obsahuje text zakázaný kmen z blocklistů (po normalizaci, s allowlistem)? */
export function isBlocked(text: string): boolean {
  return containsBlocked(text, lists());
}

export function scriptCheck(text: string, field: ModerationField, opts: ScriptOptions = {}): ScriptResult {
  if (typeof text !== "string") return { ok: false };
  const t = cleanText(text);
  if (field === "name") {
    const n = len(t);
    if (n < NAME_MIN || n > NAME_MAX || !NAME_RE.test(t) || hasLetterSymbols(t)) return { ok: false };
    if (isPublicName(t) || isBlocked(t)) return { ok: false };
    return { ok: true, text: t };
  }
  if (field !== "slogan") return { ok: false };
  const n = len(t);
  if (n < SLOGAN_MIN || n > SLOGAN_MAX) return { ok: false };
  if ((t.match(/\p{L}/gu)?.length ?? 0) < 2) return { ok: false };
  if (countEmoji(t) > MAX_EMOJI || hasLetterSymbols(t)) return { ok: false };
  if (hasContactOrLink(t) || isBlocked(t)) return { ok: false };
  // Převod velkých písmen může text prodloužit (İ → i̇) nebo změnit – znovu délka a blocklist.
  const out = fixShouting(t);
  if (out !== t && (len(out) > SLOGAN_MAX || isBlocked(out))) return { ok: false };
  if (hasForeignLetters(out)) return opts.ai ? { ok: true, text: out, review: true } : { ok: false };
  return { ok: true, text: out };
}
