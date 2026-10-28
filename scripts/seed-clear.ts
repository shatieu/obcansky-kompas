/** `pnpm seed:clear` – smaže ukázkové podpisy (is_seed) a fiktivní subjekty. */
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { clearSeed } from "@/lib/seed/insert";

const db = await resolveScriptDatabase();
const sql = createSql(db.url, { max: 1 });
try {
  const r = await clearSeed(sql);
  console.log(`seed:clear: smazáno ${r.signatures} podpisů a ${r.organizations} subjektů`);
} finally {
  await sql.end();
  await db.stop();
}
