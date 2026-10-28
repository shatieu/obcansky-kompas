import { demoSlogans } from "@/lib/demo/slogans";

/** Předvolby sloganů pro klienta davu: id → text. */
export function crowdPresets(): Record<string, string> {
  return Object.fromEntries(demoSlogans.presets.map((p) => [p.id, p.text]));
}
