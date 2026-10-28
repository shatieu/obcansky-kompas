import { createHash } from "node:crypto";
import { defineConfig } from "@playwright/test";

/**
 * E2E (SPEC §15 m16). Lokálně si Playwright spustí vlastní server na vyhrazeném portu
 * s vlastní PGlite DB, aby se nepřipojil k jinému serveru na :3000. Výchozí je produkční
 * build + `next start` (`DEV_NEXT=start` ve scripts/dev.ts): `next dev` kompiluje trasy až
 * při první návštěvě a posílá HMR full reload, který testům ruší navigace.
 *
 * - `E2E_DEV=1` – místo buildu `next dev` (rychlejší start, s HMR; global-setup trasy zahřeje).
 * - `PLAYWRIGHT_BASE_URL=https://…vercel.app pnpm e2e` – běh proti nasazené verzi (bez webServeru).
 *   `E2E_BASE_URL` funguje dál jako alias.
 * - `E2E_PORT` / `E2E_PGLITE_PORT` – jiné porty, když jsou výchozí obsazené.
 * - `E2E_PGLITE_DATA_DIR` / `E2E_DIST_DIR` – vlastní data a build (paralelní běh vedle jiného e2e serveru,
 *   výkonový test davu nad oddělenou DB se seedem 50 000).
 * - `E2E_PERF=1` – jen výkonový test davu (e2e/demonstrace/perf.spec.ts), jinak se přeskočí.
 */
const PORT = Number(process.env.E2E_PORT ?? 3456);
const PGLITE_PORT = process.env.E2E_PGLITE_PORT ?? "54456";
const external = process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_BASE_URL;
const baseURL = external || `http://localhost:${PORT}`;
const dev = process.env.E2E_DEV === "1";
const DATA_DIR = process.env.E2E_PGLITE_DATA_DIR || ".pglite/e2e";
const DIST_DIR = process.env.E2E_DIST_DIR || ".next-e2e";
/** Pevné klíče jen pro lokální e2e server (produkční build bez klíčů nenaběhne, lib/crypto.ts). */
const e2eKey = (name: string) => createHash("sha256").update(`obcansky-kompas:e2e-only:${name}`).digest("base64");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL },
  webServer: external
    ? undefined
    : {
        command: `pnpm dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: dev ? 180_000 : 600_000,
        // Vlastní distDir: `next dev` drží zámek ve své složce, druhý server ve stejné by neběžel.
        // NEXT_PUBLIC_SITE_URL: metadataBase (absolutní og:image) jinak míří na :3000.
        env: {
          PGLITE_PORT,
          PGLITE_DATA_DIR: DATA_DIR,
          NEXT_DIST_DIR: DIST_DIR,
          PORT: String(PORT),
          NEXT_PUBLIC_SITE_URL: baseURL,
          // CRON_SECRET: CLI (`pnpm demo:ban-text` v e2e/demonstrace) zneplatní cache davu přes /api/demonstrace/revalidate.
          CRON_SECRET: e2eKey("cron"),
          ...(dev ? {} : { DEV_NEXT: "start", PII_ENCRYPTION_KEY: e2eKey("pii"), HMAC_KEY: e2eKey("hmac") }),
        },
      },
  projects: [
    { name: "mobile-360", use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
