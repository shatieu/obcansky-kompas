/**
 * `pnpm db:migrate` – aplikuje supabase/migrations/*.sql na lokální PGlite (dev).
 * Produkce: migrace se aplikují přes Supabase (MCP / `supabase db push`), ne tímto skriptem.
 */
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";

const db = await resolveScriptDatabase();
if (!db.local) {
  console.error("db:migrate je jen pro lokální PGlite. Produkční migrace jdou přes Supabase.");
  process.exit(1);
}
const sql = createSql(db.url, { max: 1 });
try {
  const applied = await runMigrations(sql);
  console.log(applied.length ? `Aplikováno: ${applied.join(", ")}` : "Vše aktuální.");
} finally {
  await sql.end();
  await db.stop();
}
