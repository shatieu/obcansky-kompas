/**
 * `pnpm seed` – 500 ukázkových podpisů a 3 fiktivní subjekty (SPEC §15 milník 4),
 * plus statický snímek pro STATIC_DEMO=1 (content/generated/stats-snapshot.json).
 * Bez DATABASE_URL použije lokální PGlite (.pglite/dev), viz lib/db/dev-server.ts.
 *   --snapshot-only  jen přepíše snímek, do DB nesahá.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { facts, questionsFile } from "@/lib/content";
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { generateSeed, SEED, SEED_EPOCH } from "@/lib/seed/generate";
import { insertSeed } from "@/lib/seed/insert";
import type { StatsRow } from "@/lib/stats/aggregate";

const data = generateSeed(questionsFile, facts);

const rows: StatsRow[] = data.signatures.map((s) => ({
  answers: s.answers,
  verified: s.verified,
  region: s.region,
  ageGroup: s.ageGroup,
  municipalitySize: s.municipalitySize,
}));
const snapshotFile = path.join(process.cwd(), "content", "generated", "stats-snapshot.json");
writeFileSync(
  snapshotFile,
  JSON.stringify({ note: "Ukázková data ze seedu (pnpm seed). Nejsou skutečná.", seed: SEED, epoch: new Date(SEED_EPOCH).toISOString(), rows }) + "\n",
  "utf8",
);
console.log(`seed: snímek ${path.relative(process.cwd(), snapshotFile)} (${rows.length} řádků)`);

if (!process.argv.includes("--snapshot-only")) {
  const db = await resolveScriptDatabase();
  const sql = createSql(db.url, { max: 1 });
  try {
    if (db.local) await runMigrations(sql);
    await insertSeed(sql, data);
    const [c] = await sql<{ n: number }[]>`select count(*)::int as n from app.signature where is_seed`;
    console.log(`seed: ${c!.n} ukázkových podpisů, ${data.organizations.length} fiktivní subjekty (${db.local ? "lokální PGlite" : "DATABASE_URL"})`);
  } finally {
    await sql.end();
    await db.stop();
  }
}
