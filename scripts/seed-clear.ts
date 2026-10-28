/** `pnpm seed:clear` – smaže ukázkové podpisy (is_seed), fiktivní subjekty a ukázkový dav demonstrace. */
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { clearDemoSeed } from "@/lib/demo/seed";
import { clearSeed } from "@/lib/seed/insert";

const db = await resolveScriptDatabase();
const sql = createSql(db.url, { max: 1 });
try {
  // Panáčci by padli i kaskádou s podpisy; clearDemoSeed navíc vrátí pořadí v davu na 0, když je dav prázdný.
  const d = await clearDemoSeed(sql);
  const r = await clearSeed(sql);
  console.log(`seed:clear: smazáno ${r.signatures} podpisů, ${r.organizations} subjektů a ${d} účastníků demonstrace`);
} finally {
  await sql.end();
  await db.stop();
}
