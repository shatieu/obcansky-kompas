/**
 * `pnpm poc:clear` – před ostrým spuštěním smaže podpisy z POC (is_poc = true, SPEC §0.3).
 * Osobní údaje, historie, tokeny a e-mailové úlohy padnou kaskádou.
 */
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";

const db = await resolveScriptDatabase();
const sql = createSql(db.url, { max: 1 });
try {
  const r = await sql`delete from app.signature where is_poc`;
  console.log(`poc:clear: smazáno ${r.count} POC podpisů. Nezapomeň nastavit POC_MODE=0.`);
} finally {
  await sql.end();
  await db.stop();
}
