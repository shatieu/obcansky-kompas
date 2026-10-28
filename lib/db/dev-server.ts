import net from "node:net";
import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * Lokální Postgres bez instalace: PGlite + pglite-socket (SPEC §2). Aplikace se k němu
 * připojuje stejným driverem `postgres` jako v produkci.
 */
export const DEV_DB_PORT = Number(process.env.PGLITE_PORT ?? 54329);
export const DEV_DB_HOST = "127.0.0.1";
export const DEV_DB_URL = `postgres://postgres:postgres@${DEV_DB_HOST}:${DEV_DB_PORT}/postgres`;

export interface DevDbServer {
  url: string;
  stop: () => Promise<void>;
}

export function isPortOpen(port: number, host = DEV_DB_HOST): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

/** Spustí PGlite socket server. `dataDir` undefined = v paměti (testy). */
export async function startPgliteServer(opts: { dataDir?: string; port?: number } = {}): Promise<DevDbServer> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  if (opts.dataDir) mkdirSync(opts.dataDir, { recursive: true });
  const db = await PGlite.create(opts.dataDir ? { dataDir: opts.dataDir } : {});
  const port = opts.port ?? DEV_DB_PORT;
  const server = new PGLiteSocketServer({ db, port, host: DEV_DB_HOST, maxConnections: 10 });
  await server.start();
  const actualPort = port === 0 ? Number(String(server.getServerConn()).split(":").pop()) : port;
  return {
    url: `postgres://postgres:postgres@${DEV_DB_HOST}:${actualPort}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}

export const DEV_DATA_DIR = path.join(process.cwd(), ".pglite", "dev");

/**
 * Pro skripty (seed, seed:clear, …): použije DATABASE_URL, jinak běžící dev server,
 * jinak spustí PGlite nad `.pglite/dev` jen po dobu běhu skriptu.
 */
export async function resolveScriptDatabase(): Promise<{ url: string; stop: () => Promise<void>; local: boolean }> {
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, stop: async () => {}, local: false };
  if (await isPortOpen(DEV_DB_PORT)) return { url: DEV_DB_URL, stop: async () => {}, local: true };
  const srv = await startPgliteServer({ dataDir: DEV_DATA_DIR });
  return { ...srv, local: true };
}
