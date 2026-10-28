import { revalidateTag } from "next/cache";
import { META_TAG, personTag, tileOf, tileTag } from "./constants";

/**
 * Zneplatnění cache davu po zápisu (připojení, úprava, nahlášení, odvolání, CLI zásah). Okamžitě
 * (expire 0), aby skrytý text nezůstal v datech. Mimo Next request scope (testy, skripty) tiše nic –
 * CLI proto volá POST /api/demonstrace/revalidate (scripts/demo-cli.ts).
 */
export function demoTags(opts: { index?: number; id?: string; meta?: boolean }): string[] {
  const tags: string[] = [];
  if (opts.index !== undefined) tags.push(tileTag(tileOf(opts.index)));
  if (opts.id) tags.push(personTag(opts.id));
  if (opts.meta) tags.push(META_TAG);
  return tags;
}

export function revalidateDemoTags(tags: string[]): void {
  for (const t of tags) {
    try {
      revalidateTag(t, { expire: 0 });
    } catch {
      /* mimo Next request scope */
    }
  }
}

export function revalidateDemo(opts: { index?: number; id?: string; meta?: boolean }): void {
  revalidateDemoTags(demoTags(opts));
}

/** Povolené tagy pro revalidační endpoint (jen tagy davu). */
export const DEMO_TAG_RE = /^(demo-meta|demo-tile:\d{1,6}|demo-person:[0-9a-f-]{36})$/;
