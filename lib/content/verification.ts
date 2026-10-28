import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { reviewSchema, verificationRecordSchema, type Explainer } from "./schemas";

/** Brány ověření obsahu (SPEC §11.3). Používá content-build i verify:content. */

export function claimHash(claim: string): string {
  return createHash("sha256").update(claim, "utf8").digest("hex");
}

export type ClaimState = "verified" | "missing" | "rejected" | "no_hash" | "hash_mismatch" | "invalid";

export interface ClaimCheck {
  claimId: string;
  state: ClaimState;
  detail?: string;
}

export interface ExplainerCheck {
  id: string;
  verified: boolean;
  claims: ClaimCheck[];
  review: "ok" | "missing" | "not_approved" | "invalid";
  /** Strukturální chyby (neplatný JSON, chybí claim_id…) – verify:content kvůli nim selže. */
  structuralErrors: string[];
}

function readJson(file: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, "utf8")) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function checkExplainer(explainer: Explainer, verificationDir: string): ExplainerCheck {
  const structuralErrors: string[] = [];
  const claims: ClaimCheck[] = explainer.claims.map((c) => {
    const file = path.join(verificationDir, `${c.id}.json`);
    if (!existsSync(file)) return { claimId: c.id, state: "missing" };
    const raw = readJson(file);
    if (!raw.ok) {
      structuralErrors.push(`${c.id}.json: ${raw.error}`);
      return { claimId: c.id, state: "invalid", detail: raw.error };
    }
    // Soubor může obsahovat jeden záznam nebo pole kol; platí poslední (nejvyšší round).
    const list = Array.isArray(raw.value) ? raw.value : [raw.value];
    const parsed = list.map((r) => verificationRecordSchema.safeParse(r));
    const bad = parsed.find((p) => !p.success);
    if (bad || !parsed.length) {
      const msg = bad && !bad.success ? bad.error.issues.map((i) => i.message).join("; ") : "prázdný záznam";
      structuralErrors.push(`${c.id}.json: ${msg}`);
      return { claimId: c.id, state: "invalid", detail: msg };
    }
    const records = parsed.map((p) => p.data!).sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
    const latest = records[records.length - 1]!;
    if (latest.claim_id !== c.id) structuralErrors.push(`${c.id}.json: claim_id ${latest.claim_id} nesedí`);
    if (latest.verdict !== "ano") return { claimId: c.id, state: "rejected", detail: latest.verdict };
    const h = latest.claim_hash;
    if (!h) return { claimId: c.id, state: "no_hash", detail: "záznam nemá claim_hash" };
    if (h !== claimHash(c.claim) && h !== claimHash(c.claim.trim()))
      return { claimId: c.id, state: "hash_mismatch", detail: "tvrzení se změnilo po ověření" };
    return { claimId: c.id, state: "verified" };
  });

  let review: ExplainerCheck["review"] = "missing";
  const reviewFile = path.join(verificationDir, "reviews", `${explainer.id}.json`);
  if (existsSync(reviewFile)) {
    const raw = readJson(reviewFile);
    if (!raw.ok) {
      review = "invalid";
      structuralErrors.push(`reviews/${explainer.id}.json: ${raw.error}`);
    } else {
      const p = reviewSchema.safeParse(raw.value);
      if (!p.success) {
        review = "invalid";
        structuralErrors.push(`reviews/${explainer.id}.json: chybí impartiality/clarity`);
      } else review = p.data.impartiality === "ano" && p.data.clarity === "ano" ? "ok" : "not_approved";
    }
  }

  const verified = review === "ok" && claims.every((c) => c.state === "verified");
  return { id: explainer.id, verified, claims, review, structuralErrors };
}
