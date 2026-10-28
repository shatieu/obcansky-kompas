/**
 * `pnpm poc:clear` – před ostrým spuštěním smaže podpisy z POC (is_poc = true, SPEC §0.3).
 * Osobní údaje, historie, tokeny a e-mailové úlohy padnou kaskádou.
 */
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { resetPositionIfEmpty } from "@/lib/demo/seed";

const db = await resolveScriptDatabase();
const sql = createSql(db.url, { max: 1 });
try {
  // Panáčci z POC (online demonstrace) – i ti, jejichž podpis už POC není; zbytek padne kaskádou.
  const d = await sql`delete from app.demonstrator where is_poc`;
  const r = await sql`delete from app.signature where is_poc`;
  await resetPositionIfEmpty(sql);
  console.log(`poc:clear: smazáno ${r.count} POC podpisů a ${d.count} POC účastníků demonstrace. Nezapomeň nastavit POC_MODE=0.`);
} finally {
  await sql.end();
  await db.stop();
}
