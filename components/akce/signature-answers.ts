import type { Answers } from "@/lib/compose/types";

/**
 * HOOK(signature-api): odpovědi podpisu pro /akce?sig=<uuid> a /v/<uuid>/zakon v prohlížeči.
 *
 * GET endpoint s odpověďmi podpisu vlastní agent podpisů a zatím nemusí existovat.
 * Až bude, stačí upravit SIGNATURE_ANSWERS_URL (a případně parseSignatureAnswers).
 * Když endpoint chybí nebo selže, volající použije odpovědi z prohlížeče.
 * Očekávaný tvar: { answers, contentVersion | content_version, region? } (případně zabalené v { signature }).
 */
export const SIGNATURE_ANSWERS_URL = (uuid: string) => `/api/signature/${encodeURIComponent(uuid)}`;

export interface SignatureAnswers {
  answers: Answers;
  contentVersion: string | null;
  region: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | null | undefined): s is string => Boolean(s && UUID_RE.test(s));

export function parseSignatureAnswers(json: unknown): SignatureAnswers | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const o = (root.signature && typeof root.signature === "object" ? root.signature : root) as Record<string, unknown>;
  if (!o.answers || typeof o.answers !== "object" || Array.isArray(o.answers)) return null;
  const cv = o.contentVersion ?? o.content_version;
  return {
    answers: o.answers as Answers,
    contentVersion: typeof cv === "string" ? cv : null,
    region: typeof o.region === "string" ? o.region : null,
  };
}

export async function fetchSignatureAnswers(uuid: string): Promise<SignatureAnswers | null> {
  if (!isUuid(uuid)) return null;
  try {
    const res = await fetch(SIGNATURE_ANSWERS_URL(uuid), { headers: { accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return parseSignatureAnswers(await res.json());
  } catch {
    return null;
  }
}
