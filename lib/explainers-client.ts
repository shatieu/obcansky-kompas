import type { ExplainerEntry } from "@/lib/content";

/**
 * Vysvětlivky se načtou až při prvním otevření (samostatný chunk), aby JS kompasu
 * zůstal pod 150 kB gzip (SPEC §4.6).
 */
let cache: Promise<Record<string, ExplainerEntry>> | null = null;

export function loadExplainers(): Promise<Record<string, ExplainerEntry>> {
  cache ??= import("@/content/generated/explainers.json").then(
    (m) => (m.default ?? m) as unknown as Record<string, ExplainerEntry>,
  );
  return cache;
}
