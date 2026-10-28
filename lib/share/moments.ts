import shareJson from "@/content/generated/share.json";
import type { AddresseeType } from "@/lib/letters/schema";

/**
 * Typy adresátů – kopie ADDRESSEE_TYPES z lib/letters/schema bez importu zod do klienta.
 * Shodu hlídá typ níže a test moments.test.ts.
 */
export const ADDRESSEE_TYPES = ["poslanec", "senator", "kraj", "obec", "ministr-kultury", "prezident"] as const satisfies readonly AddresseeType[];
type _SameTypes = AddresseeType extends (typeof ADDRESSEE_TYPES)[number] ? true : never;
export const _addresseeTypesCheck: _SameTypes = true;

/**
 * Momenty sdílení (SPEC §9.4) a odkazy. Čisté funkce, použitelné na serveru i v prohlížeči.
 * Odkaz nese `?s=<moment>` pro cookieless počítání (POST /api/event {kind:"share"}).
 */
export const MOMENTS = ["podpis", "zakon", "dopisy", "fotka", "srovnani"] as const;
export type Moment = (typeof MOMENTS)[number];

export const isMoment = (s: unknown): s is Moment => typeof s === "string" && (MOMENTS as readonly string[]).includes(s);

const momentTexts = new Map((shareJson as { moments: { id: string; text: string }[] }).moments.map((m) => [m.id, m.text]));

/** Věta momentu z content/share.yaml s doplněnými {proměnnými}. */
export function shareSentence(moment: Moment, vars: Record<string, string | number> = {}): string {
  const tpl = momentTexts.get(moment);
  if (!tpl) throw new Error(`content/share.yaml: chybí moment ${moment}`);
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Přidá k odkazu `s=<moment>` (ostatní parametry zachová, hash zahodí). */
export function withMoment(url: string, moment: Moment): string {
  const u = new URL(url);
  u.hash = "";
  u.searchParams.set("s", moment);
  return u.toString();
}

/**
 * Cesta k OG obrázku (GET /api/og/<moment>). `id` = UUID podpisu (podpis, zakon, srovnani),
 * `r` = počty adresátů (dopisy), `v` = cache-buster (mění se s obsahem).
 */
export function ogImagePath(moment: Moment, q: { id?: string; r?: string; v?: string } = {}): string {
  const p = new URLSearchParams();
  if (q.id) p.set("id", q.id);
  if (q.r) p.set("r", q.r);
  if (q.v) p.set("v", q.v);
  const qs = p.toString();
  return `/api/og/${moment}${qs ? `?${qs}` : ""}`;
}

/* ---------------- Dopisy: počty adresátů podle typu ---------------- */

export type RecipientCounts = Partial<Record<AddresseeType, number>>;

/** Max. počet na typ (poslanců za kraj je nejvýš ~25). */
const MAX_PER_TYPE = 99;

/** `poslanec:3,senator:1` → { poslanec: 3, senator: 1 }. Neznámé typy a nesmysly se zahodí. */
export function parseRecipients(raw: string | null | undefined): RecipientCounts {
  const out: RecipientCounts = {};
  if (!raw) return out;
  for (const part of raw.slice(0, 200).split(",")) {
    const [type, n] = part.split(":");
    const count = Number(n);
    if (!(ADDRESSEE_TYPES as readonly string[]).includes(type ?? "")) continue;
    if (!Number.isInteger(count) || count < 1) continue;
    out[type as AddresseeType] = Math.min(count, MAX_PER_TYPE);
  }
  return out;
}

/** Opak parseRecipients v pevném pořadí typů. */
export function formatRecipients(counts: RecipientCounts): string {
  return ADDRESSEE_TYPES.flatMap((t) => {
    const n = counts[t];
    return n && n > 0 ? [`${t}:${Math.min(Math.floor(n), MAX_PER_TYPE)}`] : [];
  }).join(",");
}

/** České tvary podle počtu: [1, 2–4, 5+]. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  if (n === 1) return forms[0];
  if (n >= 2 && n <= 4) return forms[1];
  return forms[2];
}

/** Řádky „3 poslanci“, „1 senátor“ … v pevném pořadí typů. */
export function recipientLines(counts: RecipientCounts, forms: Record<AddresseeType, readonly [string, string, string]>): string[] {
  return ADDRESSEE_TYPES.flatMap((t) => {
    const n = counts[t];
    return n ? [`${n} ${plural(n, forms[t])}`] : [];
  });
}

/* ---------------- Sítě: obyčejné odkazy, žádné skripty třetích stran ---------------- */

export const NETWORKS = ["facebook", "x", "whatsapp", "telegram", "linkedin", "email"] as const;
export type Network = (typeof NETWORKS)[number];

export function networkUrl(network: Network, url: string, text: string): string {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  switch (network) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":
      return `https://x.com/intent/post?text=${t}&url=${u}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${t}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "email":
      return `mailto:?subject=${t}&body=${encodeURIComponent(`${text}\n\n${url}`)}`;
  }
}

/* ---------------- Cache-buster OG obrázku ---------------- */

/** Krátký stabilní hash (FNV-1a 32 bit, base36) – mění URL OG obrázku po úpravě podpisu. */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
