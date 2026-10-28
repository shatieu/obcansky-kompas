import { tileOf, type PersonResponse } from "@/lib/demo/constants";
import { loadMeta, loadPerson, loadTile } from "@/lib/demo/read";
import { DEFAULT_PRESET_ID, demoSlogans, presetText } from "@/lib/demo/slogans";
import { UUID_RE } from "@/lib/sign/input";
import type { ShareCard } from "./card";
import { demonstraceCard, neighborsFromTile, type DemoImageTexts } from "./demonstrace";
import { shortHash } from "./moments";
import { shareMetadata } from "./metadata";
import { sharePanelTexts, shareTexts } from "./texts";

/**
 * Data pro sdílecí obrázek demonstrace (jen server). Čte VEŘEJNÝ tvar panáčka z lib/demo
 * (cache s tagy): vlastní slogan jen schválený, jméno jen schválené a bez skrytí.
 */
export function publicSignText(slogan: string): string {
  if (slogan.startsWith("t:")) return slogan.slice(2);
  const id = slogan.startsWith("p:") ? slogan.slice(2) : slogan;
  return presetText(id) ?? presetText(DEFAULT_PRESET_ID) ?? "";
}

/** Cache-buster OG obrázku – mění se s tím, co je na obrázku. */
export function demoShareVersion(p: Pick<PersonResponse, "seed" | "pose" | "signColor" | "slogan" | "name">): string {
  return shortHash(JSON.stringify([p.seed, p.pose, p.signColor, p.slogan, p.name]));
}

export async function demonstraceShareCard(id: string, img: DemoImageTexts): Promise<{ card: ShareCard; found: boolean }> {
  const person = UUID_RE.test(id) ? await loadPerson(id.toLowerCase()).catch(() => null) : null;
  const meta = await loadMeta().catch(() => null);
  const count = meta?.count ?? null;
  if (!person) {
    // Obecný obrázek: výchozí předvolba na bílé ceduli.
    return { card: demonstraceCard({ seed: 2481, pose: "drzi", signColor: "white", signText: publicSignText(`p:${DEFAULT_PRESET_ID}`), name: null }, count, img), found: false };
  }
  let crowd: ReturnType<typeof neighborsFromTile> = [];
  try {
    const n = tileOf(person.index);
    const tile = await loadTile(n, meta ? n >= meta.tiles - 1 : true);
    crowd = neighborsFromTile(tile.items, person.index);
  } catch {
    /* dav ze seedu */
  }
  const card = demonstraceCard(
    { seed: person.seed, pose: person.pose, signColor: person.signColor, signText: publicSignText(person.slogan), name: person.name, crowd },
    count,
    img,
  );
  return { card, found: true };
}

/** Konfigurace klientského sdílení panáčka (texty z ui.yaml jen ze serveru, předvolby sloganů). */
export function demoShareConfig() {
  const img = shareTexts().share.image;
  return {
    texts: sharePanelTexts(),
    image: { brand: img.brand, demo_kicker: img.demo_kicker, demo_count_one: img.demo_count_one, demo_count_few: img.demo_count_few, demo_count_many: img.demo_count_many },
    presets: Object.fromEntries(demoSlogans.presets.map((p) => [p.id, p.text])),
    defaultPreset: DEFAULT_PRESET_ID,
  };
}

/** OG metadata /demonstrace/[id] (?id = panáček, v = cache-buster podle veřejných dat). */
export async function demoShareMetadata(id: string) {
  if (!UUID_RE.test(id)) return shareMetadata("demonstrace");
  const person = await loadPerson(id.toLowerCase()).catch(() => null);
  return shareMetadata("demonstrace", { id: id.toLowerCase(), v: person ? demoShareVersion(person) : undefined });
}
