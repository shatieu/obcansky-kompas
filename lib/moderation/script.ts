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
export type ScriptResult = { ok: true; text: string } | { ok: false };

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

export function scriptCheck(text: string, field: ModerationField): ScriptResult {
  if (typeof text !== "string") return { ok: false };
  const t = cleanText(text);
  if (field === "name") {
    const n = len(t);
    if (n < NAME_MIN || n > NAME_MAX || !NAME_RE.test(t)) return { ok: false };
    if (isPublicName(t) || isBlocked(t)) return { ok: false };
    return { ok: true, text: t };
  }
  if (field !== "slogan") return { ok: false };
  const n = len(t);
  if (n < SLOGAN_MIN || n > SLOGAN_MAX) return { ok: false };
  if ((t.match(/\p{L}/gu)?.length ?? 0) < 2) return { ok: false };
  if (countEmoji(t) > MAX_EMOJI) return { ok: false };
  if (hasContactOrLink(t) || isBlocked(t)) return { ok: false };
  return { ok: true, text: fixShouting(t) };
}
