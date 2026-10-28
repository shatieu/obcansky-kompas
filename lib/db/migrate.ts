import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type postgres from "postgres";

/**
 * Jednoduchý runner pro dev a testy: aplikuje supabase/migrations/*.sql v pořadí názvů.
 * V produkci se migrace aplikují přes Supabase (MCP / `supabase db push`) – stejné SQL.
 */
export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export function listMigrations(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
}

export async function runMigrations(sql: postgres.Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  await sql.unsafe(
    `create table if not exists public._dev_migrations (name text primary key, applied_at timestamptz not null default now())`,
  );
  const done = new Set((await sql<{ name: string }[]>`select name from public._dev_migrations`).map((r) => r.name));
  const applied: string[] = [];
  for (const file of listMigrations(dir)) {
    if (done.has(file)) continue;
    const body = readFileSync(path.join(dir, file), "utf8");
    const statements = body
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await sql.begin(async (tx) => {
      for (const st of statements) await tx.unsafe(st);
      await tx.unsafe(`insert into public._dev_migrations (name) values ($1)`, [file]);
    });
    applied.push(file);
  }
  return applied;
}
