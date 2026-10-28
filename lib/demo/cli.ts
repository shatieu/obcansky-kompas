import type postgres from "postgres";
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { UUID_RE } from "@/lib/sign/input";
import { demoTags } from "./cache";
import { moderateDemonstrator, type ModAction } from "./service";

/**
 * Pomůcky CLI moderace (pnpm demo:reported / demo:hide / demo:unhide / demo:ban-text, SPEC-demonstrace §4.3).
 * DB: DATABASE_URL, jinak lokální PGlite (jako seed). Cache: skript běží mimo Next, takže
 * revalidateTag nefunguje – když jsou nastavené NEXT_PUBLIC_SITE_URL a CRON_SECRET, zavolá
 * POST <site>/api/demonstrace/revalidate; jinak vypíše, že se změna projeví až po vypršení cache.
 */
export async function withScriptDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const db = await resolveScriptDatabase();
  const sql = createSql(db.url, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
    await db.stop();
  }
}

export async function revalidateRemote(tags: string[], fetchImpl: typeof fetch = fetch): Promise<"ok" | "skipped" | "failed"> {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const secret = process.env.CRON_SECRET;
  if (!site || !secret || !tags.length) {
    console.warn(
      "revalidace přeskočena (chybí NEXT_PUBLIC_SITE_URL nebo CRON_SECRET) – v davu se změna projeví po vypršení cache (dlaždice až 24 h).",
    );
    return "skipped";
  }
  try {
    const res = await fetchImpl(`${site}/api/demonstrace/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`revalidace OK: ${tags.join(", ")}`);
    return "ok";
  } catch (e) {
    console.error(`revalidace selhala (${(e as Error).message}) – zopakuj příkaz, nebo počkej na vypršení cache.`);
    return "failed";
  }
}

/** Společné tělo demo:hide / demo:unhide / demo:ban-text. */
export async function runModerationCli(action: ModAction, argv = process.argv.slice(2)): Promise<void> {
  const id = argv.find((a) => !a.startsWith("-"))?.toLowerCase();
  if (!id || !UUID_RE.test(id)) {
    console.error(`Použití: pnpm demo:${action} <id panáčka>`);
    process.exitCode = 1;
    return;
  }
  const r = await withScriptDb((sql) => moderateDemonstrator(sql, id, action));
  if (!r) {
    console.error(`demo:${action}: panáček ${id} neexistuje`);
    process.exitCode = 1;
    return;
  }
  console.log(`demo:${action}: ${id} (pořadí ${r.index + 1}) – zapsáno do moderation_log (cli)`);
  await revalidateRemote(demoTags({ index: r.index, id }));
}
