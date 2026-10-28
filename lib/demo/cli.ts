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
 * POST <site>/api/demonstrace/revalidate. Bez nich nebo při selhání skončí příkaz nenulovým
 * kódem (revalidateOrFail), pokud není výslovně `--no-revalidate`.
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
  if (!tags.length) return "ok";
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const secret = process.env.CRON_SECRET;
  if (!site || !secret) {
    console.warn(
      "revalidace přeskočena (chybí NEXT_PUBLIC_SITE_URL nebo CRON_SECRET) – v davu se změna projeví po vypršení cache (nejdéle ~30 min).",
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
  await revalidateOrFail(`demo:${action}`, demoTags({ index: r.index, id }), argv);
}

/** Max. tagů na jedno volání revalidačního endpointu (endpoint víc nepřijme). */
const TAGS_PER_CALL = 100;

/**
 * Revalidace po zásahu z CLI. Zásah bez zneplatnění cache není účinný (skrytý text dál visí
 * v CDN), proto přeskočení (chybí NEXT_PUBLIC_SITE_URL / CRON_SECRET) i selhání skončí
 * nenulovým kódem a jasnou hláškou. `--no-revalidate` = vědomě bez revalidace (lokální DB).
 * Vrací true, když je vše v pořádku (nebo revalidace vědomě vypnutá).
 */
export async function revalidateOrFail(
  label: string,
  tags: string[],
  argv: string[] = process.argv.slice(2),
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (argv.includes("--no-revalidate")) {
    console.log(`${label}: revalidace vypnutá (--no-revalidate) – změna se v davu projeví až po vypršení cache.`);
    return true;
  }
  const unique = [...new Set(tags)];
  if (!unique.length) return true;
  let result: "ok" | "skipped" | "failed" = "ok";
  for (let i = 0; i < unique.length && result === "ok"; i += TAGS_PER_CALL) {
    result = await revalidateRemote(unique.slice(i, i + TAGS_PER_CALL), fetchImpl);
  }
  if (result === "ok") return true;
  console.error(
    `${label}: CHYBA – zásah je zapsaný v DB, ale cache se ${result === "skipped" ? "nezneplatnila (chybí NEXT_PUBLIC_SITE_URL nebo CRON_SECRET)" : "nepodařilo zneplatnit"}. ` +
      `Nastav env a spusť příkaz znovu (zásah je idempotentní), nebo použij --no-revalidate.`,
  );
  process.exitCode = 2;
  return false;
}
