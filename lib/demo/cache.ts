import { dangerouslyDeleteByTag } from "@vercel/functions";
import { revalidateTag } from "next/cache";
import { META_TAG, overviewTag, personTag, tileOf, tileTag } from "./constants";

/**
 * Zneplatnění cache davu po zápisu (připojení, úprava, nahlášení, odvolání, AI verdikt, CLI zásah).
 * Dvě vrstvy:
 *  1. Data cache Next (`unstable_cache` s tagy) – `revalidateTag(tag, { expire: 0 })`.
 *  2. CDN Vercelu – odpovědi route handlerů nesou `Vercel-Cache-Tag`; `revalidateTag` je podle
 *     dokumentace Next nečistí, proto navíc `dangerouslyDeleteByTag` z `@vercel/functions`
 *     (okamžité smazání, ne „stale“ – skrytý text se nesmí servírovat ani jednou). Mimo Vercel
 *     (lokálně, testy) je to no-op.
 * Mimo Next request scope (testy, skripty) revalidateTag tiše nic – CLI proto volá
 * POST /api/demonstrace/revalidate (scripts/demo-*.ts).
 */
export function demoTags(opts: { index?: number; id?: string; meta?: boolean }): string[] {
  const tags: string[] = [];
  // Přehled (1 B/osoba, jen vzhled) se čistí s dlaždicí: připojení, odvolání, změna pózy/barvy.
  // Čistí se i při změně jen textu (zápis neví, co se změnilo) – jen pár zbytečných missů.
  if (opts.index !== undefined) tags.push(tileTag(tileOf(opts.index)), overviewTag(tileOf(opts.index)));
  if (opts.id) tags.push(personTag(opts.id));
  if (opts.meta) tags.push(META_TAG);
  return tags;
}

export type PurgeFn = (tags: string[]) => Promise<void>;

const vercelPurge: PurgeFn = (tags) => dangerouslyDeleteByTag(tags);

export async function revalidateDemoTags(tags: string[], purge: PurgeFn = vercelPurge): Promise<void> {
  if (!tags.length) return;
  for (const t of tags) {
    try {
      revalidateTag(t, { expire: 0 });
    } catch {
      /* mimo Next request scope */
    }
  }
  try {
    await purge(tags);
  } catch (e) {
    // Selhání čištění CDN nesmí shodit zápis; záloha je krátká platnost plných dlaždic (5 min).
    const code = (e as { code?: string })?.code ?? (e as Error)?.name ?? "unknown";
    console.error(`[demo] cdn purge failed code=${String(code).slice(0, 40)}`);
  }
}

export function revalidateDemo(opts: { index?: number; id?: string; meta?: boolean }): Promise<void> {
  return revalidateDemoTags(demoTags(opts));
}

/** Povolené tagy pro revalidační endpoint (jen tagy davu). */
export const DEMO_TAG_RE = /^(demo-meta|demo-tile:\d{1,6}|demo-overview:\d{1,6}|demo-person:[0-9a-f-]{36})$/;
