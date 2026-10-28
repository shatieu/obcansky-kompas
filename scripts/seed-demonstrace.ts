/**
 * `pnpm seed:demonstrace` – ukázkový dav (SPEC-demonstrace §9): 500 panáčků na seedových podpisech
 * (is_seed), plus statický export pro STATIC_DEMO=1 (content/generated/demonstrace-tiles/*.json).
 *   --count N      jiný počet (výkonový test, např. 50000 – jen lokálně a na stagingu); chybějící
 *                  seedové podpisy se dovytvoří (jen odpovědi, bez osobních údajů)
 *   --export-only  jen přepíše statický export (500), do DB nesahá
 * Bez DATABASE_URL použije lokální PGlite (.pglite/dev); když v ní nejsou seedové podpisy, nahraje `pnpm seed`.
 */
import { facts, questionsFile } from "@/lib/content";
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { DEMO_SEED_COUNT, generateDemoSeed, insertDemoSeed, writeStaticExport } from "@/lib/demo/seed";
import { loadDemoSlogans } from "@/lib/demo/slogans-schema";
import { generateSeed } from "@/lib/seed/generate";
import { insertSeed } from "@/lib/seed/insert";

const argv = process.argv.slice(2);
const countArg = argv.indexOf("--count");
const count = countArg >= 0 ? Number(argv[countArg + 1]) : DEMO_SEED_COUNT;
if (!Number.isInteger(count) || count < 1 || count > 200_000) {
  console.error("seed:demonstrace: --count musí být celé číslo 1–200000");
  process.exit(1);
}

const slogans = loadDemoSlogans();
const staticItems = generateDemoSeed(DEMO_SEED_COUNT, slogans);
const exp = writeStaticExport(staticItems, slogans);
console.log(`seed:demonstrace: statický export content/generated/demonstrace-tiles (${staticItems.length} účastníků, ${exp.tiles} dlaždic)`);

if (!argv.includes("--export-only")) {
  if (count >= 10_000 && process.env.DATABASE_URL)
    console.warn("seed:demonstrace: velký seed proti DATABASE_URL – jen lokálně a na stagingu (SPEC-demonstrace §9).");
  const db = await resolveScriptDatabase();
  const sql = createSql(db.url, { max: 1 });
  try {
    if (db.local) await runMigrations(sql);
    const [s] = await sql<{ n: number }[]>`select count(*)::int as n from app.signature where is_seed`;
    if (s!.n === 0) {
      await insertSeed(sql, generateSeed(questionsFile, facts));
      console.log("seed:demonstrace: chyběly seedové podpisy → nahrán `pnpm seed`");
    }
    const items = count === DEMO_SEED_COUNT ? staticItems : generateDemoSeed(count, slogans);
    const t0 = Date.now();
    const r = await insertDemoSeed(sql, items);
    console.log(
      `seed:demonstrace: ${r.inserted} ukázkových účastníků` +
        (r.extraSignatures ? `, dovytvořeno ${r.extraSignatures} seedových podpisů` : "") +
        ` za ${((Date.now() - t0) / 1000).toFixed(1)} s (${db.local ? "lokální PGlite" : "DATABASE_URL"}). V davu jsou vidět jen s DEMO_MODE=1.`,
    );
  } finally {
    await sql.end();
    await db.stop();
  }
}
