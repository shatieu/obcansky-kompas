/**
 * Běhové pomůcky akceptačních testů: PGlite DB přes helper aplikace, spouštění
 * `pnpm` skriptů (přes tsx, bez pnpm) a volitelné načítání modulů, které ještě nemusí existovat.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type postgres from "postgres";
import { ROOT } from "./content";

export const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

export interface TestDb {
  url: string;
  sql: postgres.Sql;
  stop: () => Promise<void>;
}

/** Postgres v paměti (PGlite + pglite-socket, SPEC §2) s aplikovanými migracemi ze supabase/migrations. */
export async function startTestDb(): Promise<TestDb> {
  const { startPgliteServer } = await import("@/lib/db/dev-server");
  const { createSql } = await import("@/lib/db/client");
  const { runMigrations } = await import("@/lib/db/migrate");
  const srv = await startPgliteServer({ port: 0 });
  const sql = createSql(srv.url, { max: 2 });
  await runMigrations(sql);
  return {
    url: srv.url,
    sql,
    stop: async () => {
      await sql.end({ timeout: 1 }).catch(() => {});
      await srv.stop().catch(() => {});
    },
  };
}

export interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Spustí skript z scripts/ stejně jako `pnpm <script>` (tsx). `cwd` určuje, který content/ se čte. */
export function runScript(script: string, opts: { cwd?: string; env?: Record<string, string | undefined>; args?: string[] } = {}): ScriptResult {
  const abs = path.isAbsolute(script) ? script : path.join(ROOT, script);
  const env = { ...process.env, ...opts.env } as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(opts.env ?? {})) if (v === undefined) delete env[k];
  const r = spawnSync(process.execPath, [TSX_CLI, "--tsconfig", path.join(ROOT, "tsconfig.json"), abs, ...(opts.args ?? [])], {
    cwd: opts.cwd ?? ROOT,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * Asynchronní varianta – nutná, když skript mluví s PGlite serverem běžícím v tomto procesu
 * (spawnSync by zablokoval event loop a spojení by vypršelo).
 */
export function runScriptAsync(script: string, opts: { cwd?: string; env?: Record<string, string | undefined>; args?: string[] } = {}): Promise<ScriptResult> {
  const abs = path.isAbsolute(script) ? script : path.join(ROOT, script);
  const env = { ...process.env, ...opts.env } as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(opts.env ?? {})) if (v === undefined) delete env[k];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TSX_CLI, "--tsconfig", path.join(ROOT, "tsconfig.json"), abs, ...(opts.args ?? [])], { cwd: opts.cwd ?? ROOT, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    const timer = setTimeout(() => child.kill(), 120_000);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

/** První existující soubor z kandidátů (relativně ke kořeni repa). */
export function firstExisting(candidates: string[]): string | null {
  for (const c of candidates) {
    const abs = path.join(ROOT, c);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/** Načte modul ze souboru (absolutní cesta), nebo null. */
export async function importFile<T = Record<string, unknown>>(abs: string | null): Promise<T | null> {
  if (!abs) return null;
  return (await import(/* @vite-ignore */ pathToFileURL(abs).href)) as T;
}

/** Nastaví env proměnné a vrátí funkci, která je vrátí zpět. */
export function withEnv(vars: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

export const randomKey = () => Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString("base64");
