import { and, eq, isNull } from "drizzle-orm";
import type { Answers } from "@/lib/compose/types";
import { getDb, hasDatabase } from "@/lib/db/client";
import { signature } from "@/lib/db/schema";

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
    const rows = await getDb()
      .select({ answers: signature.answers, contentVersion: signature.contentVersion })
      .from(signature)
      .where(and(eq(signature.id, uuid), isNull(signature.withdrawnAt)))
      .limit(1);
    const row = rows[0];
    if (!row || !row.answers || typeof row.answers !== "object") return null;
    return { answers: row.answers as Answers, contentVersion: row.contentVersion };
  } catch (e) {
    console.error("zakon: čtení podpisu selhalo", e instanceof Error ? e.message : e);
    return null;
  }
}
