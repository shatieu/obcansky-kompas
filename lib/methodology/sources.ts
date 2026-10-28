import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { CONTENT_DIR } from "@/lib/content/load";
import { claimSchema, EXPLAINER_FILE_RE, explainerSchema, factsFileSchema, verificationRecordSchema } from "@/lib/content/schemas";
import { checkExplainer, claimHash } from "@/lib/content/verification";

/**
 * Index všech tvrzení pro /metodika/zdroje (SPEC §11.3, §13). Čte content/explainers,
 * content/facts.yaml a content/verification při sestavení statické stránky – jen Node.
 */

export type VerdictState = "ano" | "ne" | "oprava" | "missing" | "changed";

export interface ClaimSource {
  id: string;
  claim: string;
  sourceUrl: string;
  sourceTitle: string;
  locator: string;
  state: VerdictState;
  correction: string | null;
  round: number | null;
  verifier: string | null;
  checkedAt: string | null;
  humanReviewed: boolean;
}

export interface SourceGroup {
  kind: "explainer" | "law" | "facts";
  id: string;
  /** Jen u vysvětlivek: zobrazuje se (plně ověřená), nebo „Vysvětlivka se připravuje“. */
  shown: boolean | null;
  humanReviewed: boolean;
  claims: ClaimSource[];
}

export interface SourcesIndex {
  groups: SourceGroup[];
  totals: { claims: number; verified: number; open: number; humanReviewed: number };
}

type Claim = z.infer<typeof claimSchema>;

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** Poslední záznam ověření (nejvyšší round) a stav vůči aktuálnímu znění tvrzení. */
export function latestVerification(claimId: string, claimText: string, verificationDir: string): Omit<ClaimSource, "id" | "claim" | "sourceUrl" | "sourceTitle" | "locator"> {
  const empty = { state: "missing" as const, correction: null, round: null, verifier: null, checkedAt: null, humanReviewed: false };
  const file = path.join(verificationDir, `${claimId}.json`);
  if (!existsSync(file)) return empty;
  const raw = readJson(file);
  const list = (Array.isArray(raw) ? raw : [raw])
    .map((r) => verificationRecordSchema.safeParse(r))
    .filter((p) => p.success)
    .map((p) => p.data!)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  const latest = list[list.length - 1];
  if (!latest) return empty;
  const h = latest.claim_hash;
  const changed = latest.verdict === "ano" && h !== claimHash(claimText) && h !== claimHash(claimText.trim());
  return {
    state: changed ? "changed" : latest.verdict,
    correction: latest.verdict === "oprava" && latest.correction ? latest.correction : null,
    round: typeof latest.round === "number" ? latest.round : null,
    verifier: latest.verifier ?? null,
    checkedAt: latest.checked_at ?? null,
    humanReviewed: (latest as Record<string, unknown>).human_reviewed === true,
  };
}

function toClaimSource(c: Pick<Claim, "id" | "claim" | "source_url" | "source_title" | "locator">, dir: string): ClaimSource {
  return {
    id: c.id,
    claim: c.claim.trim(),
    sourceUrl: c.source_url,
    sourceTitle: c.source_title,
    locator: c.locator,
    ...latestVerification(c.id, c.claim, dir),
  };
}

const lawFileSchema = z.looseObject({
  id: z.string().optional(),
  human_reviewed: z.boolean().optional(),
  claims: z.array(claimSchema).default([]),
});

/** Přirozené řazení id vysvětlivek: q1, q1-opt1 … q2, q2-opt10. */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

export function buildSourcesIndex(contentDir = CONTENT_DIR): SourcesIndex {
  const verificationDir = path.join(contentDir, "verification");
  const explainerDir = path.join(contentDir, "explainers");
  const groups: SourceGroup[] = [];

  if (existsSync(explainerDir)) {
    const files = readdirSync(explainerDir).filter((f) => EXPLAINER_FILE_RE.test(f));
    const explainers = files
      .map((f) => explainerSchema.parse(parse(readFileSync(path.join(explainerDir, f), "utf8"))))
      .sort((a, b) => naturalCompare(a.id, b.id));
    for (const e of explainers) {
      groups.push({
        kind: "explainer",
        id: e.id,
        shown: checkExplainer(e, verificationDir).verified,
        humanReviewed: e.human_reviewed === true,
        claims: e.claims.map((c) => toClaimSource(c, verificationDir)),
      });
    }
    const lawFile = path.join(explainerDir, "law-models.yaml");
    if (existsSync(lawFile)) {
      const law = lawFileSchema.parse(parse(readFileSync(lawFile, "utf8")));
      groups.push({
        kind: "law",
        id: law.id ?? "law-models",
        shown: null,
        humanReviewed: law.human_reviewed === true,
        claims: law.claims.map((c) => toClaimSource(c, verificationDir)),
      });
    }
  }

  const factsFile = path.join(contentDir, "facts.yaml");
  if (existsSync(factsFile)) {
    const facts = factsFileSchema.parse(parse(readFileSync(factsFile, "utf8")));
    groups.push({
      kind: "facts",
      id: "facts",
      shown: null,
      humanReviewed: false,
      claims: facts.map((f) => toClaimSource(f, verificationDir)),
    });
  }

  const all = groups.flatMap((g) => g.claims);
  const verified = all.filter((c) => c.state === "ano").length;
  return {
    groups,
    totals: {
      claims: all.length,
      verified,
      open: all.length - verified,
      humanReviewed: all.filter((c) => c.humanReviewed).length,
    },
  };
}

/** Položky, které prošly lidskou kontrolou (celé vysvětlivky nebo jednotlivá tvrzení). */
export function humanReviewedItems(index: SourcesIndex): string[] {
  const out: string[] = [];
  for (const g of index.groups) {
    if (g.humanReviewed) out.push(g.id);
    else for (const c of g.claims) if (c.humanReviewed) out.push(c.id);
  }
  return out;
}
