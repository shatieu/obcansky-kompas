/**
 * `pnpm moderation:recheck` – po nastavení MODERATION_API_KEY (poskytovatel výchozí anthropic,
 * model výchozí claude-haiku-5-5) projde AI kontrolou všechny už schválené vlastní slogany a jména
 * (SPEC-demonstrace §4.2). Texty zůstávají `approved` (viditelné), dokud je AI neodmítne.
 *
 *   pnpm moderation:recheck [--batch 20] [--no-revalidate]
 *
 * Odmítnuté texty zmizí z davu až po zneplatnění cache: skript sbírá tagy dotčených dlaždic
 * a karet a na konci zavolá POST <NEXT_PUBLIC_SITE_URL>/api/demonstrace/revalidate (CRON_SECRET).
 * Bez těch env nebo při selhání skončí nenulově (kromě `--no-revalidate`).
 *
 * DB: DATABASE_URL (nebo lokální PGlite jako ostatní skripty). Env se nenačítá ze souboru –
 * na produkci např. `vercel env pull .env.production.local` a `node --env-file=… ` / export.
 */
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { demoTags } from "@/lib/demo/cache";
import { revalidateOrFail } from "@/lib/demo/cli";
import { aiEnabled, moderationModel } from "@/lib/moderation/ai";
import { runRecheck } from "@/lib/moderation/recheck";

const i = process.argv.indexOf("--batch");
const batch = i > 0 ? Math.max(1, Number(process.argv[i + 1]) || 20) : 20;

if (!aiEnabled()) {
  console.error("moderation:recheck: AI kontrola není zapnutá (chybí MODERATION_API_KEY, nebo MODERATION_PROVIDER=none).");
  process.exit(1);
}
console.log(`moderation:recheck: model ${moderationModel()}`);

const db = await resolveScriptDatabase();
const sql = createSql(db.url, { max: 2 });
try {
  let n = 0;
  // Skript běží mimo Next: odmítnuté texty zneplatní přes POST /api/demonstrace/revalidate (data cache i CDN).
  const tags = new Set<string>();
  const r = await runRecheck(sql, {
    batch,
    revalidate: (index, id) => {
      for (const t of demoTags({ index, id })) tags.add(t);
    },
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
  await revalidateOrFail("moderation:recheck", [...tags]);
} finally {
  await sql.end();
  await db.stop();
}
