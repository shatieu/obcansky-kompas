import { facts, questionsFile } from "@/lib/content";
import { getSql, hasDatabase } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { generateSeed, SEED_EPOCH } from "@/lib/seed/generate";
import { listPublicOrganizations, sortCzech, type PublicOrganization } from "./service";

/**
 * Zdroj pro /hnuti: STATIC_DEMO=1 → fiktivní subjekty ze seedu (bez DB, SPEC §16 A),
 * jinak DB (seed jen s DEMO_MODE=1). Nedostupná DB = null (stránka ukáže hlášku).
 */
export async function getOrganizations(): Promise<PublicOrganization[] | null> {
  if (flags.staticDemo()) return seedOrganizations();
  if (!hasDatabase()) return null;
  try {
    return await listPublicOrganizations(getSql(), { includeSeed: flags.demoMode() });
  } catch (e) {
    console.error("[hnuti] dotaz selhal:", (e as Error).message);
    return null;
  }
}

export function seedOrganizations(): PublicOrganization[] {
  const date = new Date(SEED_EPOCH).toISOString();
  return sortCzech(
    generateSeed(questionsFile, facts).organizations.map((o, i) => ({
      id: `seed-${i}`,
      name: o.name,
      type: o.type,
      invitedAt: date,
      submittedAt: o.submitted ? date : null,
      answers: o.submitted ? o.answers : null,
      justifications: o.submitted ? o.justifications : null,
      isSeed: true,
    })),
  );
}
