/**
 * `pnpm moderation:recheck` – po nastavení MODERATION_PROVIDER=anthropic, MODERATION_API_KEY
 * a MODERATION_MODEL projde AI kontrolou všechny už schválené vlastní slogany a jména
 * (SPEC-demonstrace §4.2). Texty zůstávají `approved` (viditelné), dokud je AI neodmítne.
 *
 *   pnpm moderation:recheck [--batch 20]
 *
 * DB: DATABASE_URL (nebo lokální PGlite jako ostatní skripty). Env se nenačítá ze souboru –
 * na produkci např. `vercel env pull .env.production.local` a `node --env-file=… ` / export.
 */
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { aiEnabled } from "@/lib/moderation/ai";
import { runRecheck } from "@/lib/moderation/recheck";

const i = process.argv.indexOf("--batch");
const batch = i > 0 ? Math.max(1, Number(process.argv[i + 1]) || 20) : 20;

if (!aiEnabled()) {
  console.error("moderation:recheck: AI kontrola není zapnutá (MODERATION_PROVIDER=anthropic a MODERATION_API_KEY).");
  process.exit(1);
}
if (!process.env.MODERATION_MODEL?.trim()) {
  console.error("moderation:recheck: chybí MODERATION_MODEL.");
  process.exit(1);
}

const db = await resolveScriptDatabase();
const sql = createSql(db.url, { max: 2 });
try {
  let n = 0;
  const r = await runRecheck(sql, {
    batch,
    onBatch: (b) => {
      if (b.claimed === 0) return;
      n += b.claimed;
      console.log(`  dávka: ${b.claimed} (ok ${b.approved}, odmítnuto ${b.rejected}, změněno ${b.stale}, chyba ${b.failed}) – celkem ${n}`);
    },
  });
  const p = r.processed;
  console.log(
    `moderation:recheck: zařazeno ${r.enqueued} (už ve frontě ${r.alreadyQueued}); zpracováno ${p.claimed}: ` +
      `schváleno ${p.approved}, odmítnuto ${p.rejected}, mezitím změněno ${p.stale}, chyba ${p.failed}` +
      (p.failed ? " – chybující úlohy zopakuje cron s backoffem (nebo spusť znovu později)" : ""),
  );
} finally {
  await sql.end();
  await db.stop();
}
