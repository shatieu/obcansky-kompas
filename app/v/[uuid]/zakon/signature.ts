import type { Answers } from "@/lib/compose/types";
import { getSql, hasDatabase } from "@/lib/db/client";

/**
 * Odpovědi podpisu pro „Můj zákon“ přímo z DB (jen čtení: answers + content_version,
 * žádné osobní údaje). Bez DB, s neplatným UUID, u odvolaného podpisu nebo při chybě → null
 * a stránka použije odpovědi z prohlížeče.
 * TODO(signature-agent): až bude sdílený čtecí helper / cache s tagem sig:<uuid>, použít ten.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SignatureForLaw {
  answers: Answers;
  contentVersion: string;
}

export async function readSignatureForLaw(uuid: string): Promise<SignatureForLaw | null> {
  if (!hasDatabase() || !UUID_RE.test(uuid)) return null;
  try {
    // Přímo přes sdílený klient `postgres` (ne drizzle: ten by klientovi přepsal serializéry json/jsonb a časů).
    const [row] = await getSql()<{ answers: unknown; content_version: string }[]>`
      select answers, content_version from app.signature where id = ${uuid} and withdrawn_at is null limit 1`;
    if (!row || !row.answers || typeof row.answers !== "object") return null;
    return { answers: row.answers as Answers, contentVersion: row.content_version };
  } catch (e) {
    console.error("zakon: čtení podpisu selhalo", e instanceof Error ? e.message : e);
    return null;
  }
}
