import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Jediný přístup k DB: driver `postgres` (porsager) přes pooler, `prepare: false`
 * kvůli transakčnímu módu Supavisoru (SPEC §14.2). V dev/test míří na PGlite přes
 * pglite-socket (viz scripts/dev.ts, lib/db/dev-server.ts).
 */
type Sql = postgres.Sql;

const globalForDb = globalThis as unknown as { __kompasSql?: Sql };

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function createSql(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, {
    prepare: false,
    max: opts.max ?? Number(process.env.DATABASE_POOL_MAX ?? 5),
    connect_timeout: 5,
    idle_timeout: 20,
    onnotice: () => {},
  });
}

export function getSql(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL není nastavené");
  if (!globalForDb.__kompasSql) globalForDb.__kompasSql = createSql(url);
  return globalForDb.__kompasSql;
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

export { schema };
