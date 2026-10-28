import { unstable_cache } from "next/cache";
import { evaluate } from "@/lib/compose/engine";
import { bandThresholds } from "@/lib/compose/q1";
import { QUESTION_IDS, type Answers, type QuestionId } from "@/lib/compose/types";
import { facts, questionsFile } from "@/lib/content";
import { getSql, hasDatabase } from "@/lib/db/client";
import { flags } from "@/lib/env";
import { UUID_RE } from "@/lib/sign/input";
import { getPublicSignature, signatureTag, type PublicSignature } from "@/lib/sign/read";
import type { StatsResult } from "@/lib/stats/aggregate";
import { compare, type Comparison, type OrgInput } from "@/lib/stats/compare";
import { getStats } from "@/lib/stats/source";

/**
 * Data pro srovnání a sdílecí obrázky (jen server). Agregace z cache 60 s (SPEC §14.2:
 * statistiky zpožděné max. 60 s), podpis z cache s tagem `sig:<uuid>`.
 */
export const STATS_REVALIDATE = 60;

/** Agregované statistiky bez filtrů, max. jeden dotaz za minutu. null = nedostupné. */
export const getCachedStats: () => Promise<StatsResult | null> = unstable_cache(() => getStats({}), ["share-stats-all"], {
  revalidate: STATS_REVALIDATE,
  tags: ["stats"],
});

async function loadOrganizations(): Promise<OrgInput[]> {
  if (!hasDatabase() || flags.staticDemo()) return [];
  const includeSeed = flags.demoMode();
  const rows = await getSql()<{ name: string; answers: Answers | null; submitted: boolean }[]>`
    select name, answers, submitted_at is not null as submitted
    from app.organization
    where (${includeSeed}::boolean or not is_seed)
    order by name`;
  return rows.map((r) => ({
    name: r.name,
    answers: r.submitted && r.answers && typeof r.answers === "object" ? r.answers : null,
  }));
}

/** Odpovědi stran a hnutí (veřejné, po odeslání), cache 60 s. */
export const getCachedOrganizations: () => Promise<OrgInput[]> = unstable_cache(
  async () => {
    try {
      return await loadOrganizations();
    } catch (e) {
      console.error("[share] organizace: dotaz selhal", (e as Error).message);
      return [];
    }
  },
  ["share-organizations"],
  { revalidate: STATS_REVALIDATE, tags: ["organizations"] },
);

export function skippedQuestions(answers: Answers): Set<QuestionId> {
  const { states } = evaluate(answers, questionsFile);
  return new Set(QUESTION_IDS.filter((q) => states[q].status === "skipped"));
}

export function comparisonFor(answers: Answers, stats: StatsResult, organizations: OrgInput[]): Comparison {
  return compare({ answers, stats, organizations, questionsFile, thresholds: bandThresholds(questionsFile, facts) });
}

export type SignatureLookup =
  | { status: "ok"; signature: PublicSignature }
  | { status: "missing" | "withdrawn" | "unavailable" };

/** Podpis pro srovnání / OG. Bez DB nebo při chybě „unavailable“. */
export async function lookupSignature(uuid: string): Promise<SignatureLookup> {
  if (!UUID_RE.test(uuid)) return { status: "missing" };
  if (!hasDatabase() || flags.staticDemo()) return { status: "unavailable" };
  try {
    const sig = await getPublicSignature(uuid.toLowerCase());
    if (!sig) return { status: "missing" };
    if (sig.withdrawn) return { status: "withdrawn" };
    return { status: "ok", signature: sig };
  } catch {
    return { status: "unavailable" };
  }
}

/** Jen odpovědi a verze obsahu neodvolaného podpisu (GET /api/signature/[uuid]). Žádné osobní údaje. */
export interface SignatureAnswersRow {
  answers: Answers;
  content_version: string;
}

export function getSignatureAnswers(uuid: string): Promise<SignatureAnswersRow | null> {
  const id = uuid.toLowerCase();
  return unstable_cache(
    async () => {
      const [row] = await getSql()<{ answers: Answers; content_version: string }[]>`
        select answers, content_version from app.signature where id = ${id} and withdrawn_at is null`;
      return row ? { answers: row.answers, content_version: row.content_version } : null;
    },
    ["signature-answers", id],
    { tags: [signatureTag(id)], revalidate: 3600 },
  )();
}
