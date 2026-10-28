/**
 * `pnpm dev` bez jakýchkoli klíčů (SPEC §18): když chybí DATABASE_URL, spustí PGlite
 * (data v .pglite/dev) jako Postgres server přes pglite-socket na 127.0.0.1:54329,
 * aplikuje migrace, při prázdné DB nahraje seed, zapne DEMO_MODE=1 a spustí `next dev`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { facts, questionsFile } from "@/lib/content";
import { createSql } from "@/lib/db/client";
import { DEV_DATA_DIR, DEV_DB_PORT, isPortOpen, startPgliteServer } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { generateSeed } from "@/lib/seed/generate";
import { insertSeed } from "@/lib/seed/insert";

const env: NodeJS.ProcessEnv = { ...process.env };
let stop: (() => Promise<void>) | undefined;

if (!env.DATABASE_URL) {
  if (await isPortOpen(DEV_DB_PORT)) {
    console.error(`Port ${DEV_DB_PORT} je obsazený (běží jiný dev server?). Nastav PGLITE_PORT nebo DATABASE_URL.`);
    process.exit(1);
  }
  const srv = await startPgliteServer({ dataDir: DEV_DATA_DIR });
  stop = srv.stop;
  const sql = createSql(srv.url, { max: 1 });
  const applied = await runMigrations(sql);
  if (applied.length) console.log(`[dev] migrace: ${applied.join(", ")}`);
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from app.signature`;
  if (row!.n === 0) {
    await insertSeed(sql, generateSeed(questionsFile, facts));
    console.log("[dev] prázdná DB → nahrán seed (500 ukázkových podpisů)");
  }
  await sql.end();
  env.DATABASE_URL = srv.url;
  env.DATABASE_POOL_MAX ??= "4";
  env.DEMO_MODE ??= "1";
  env.POC_MODE ??= "1";
  console.log(`[dev] PGlite běží na ${srv.url} (data: .pglite/dev), DEMO_MODE=${env.DEMO_MODE}`);
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", "--webpack", ...process.argv.slice(2)], { stdio: "inherit", env });

const shutdown = async (code = 0) => {
  child.kill();
  await stop?.();
  process.exit(code);
};
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
child.on("exit", (code) => void shutdown(code ?? 0));
