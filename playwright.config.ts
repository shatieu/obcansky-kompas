import { defineConfig } from "@playwright/test";

/**
 * E2E (SPEC §15 m16). Lokálně si Playwright spustí vlastní `pnpm dev` na vyhrazeném portu
 * s vlastní PGlite DB, aby se nepřipojil k jinému serveru na :3000.
 *
 * - `PLAYWRIGHT_BASE_URL=https://…vercel.app pnpm e2e` – běh proti nasazené verzi (bez webServeru).
 *   `E2E_BASE_URL` funguje dál jako alias.
 * - `E2E_PORT` / `E2E_PGLITE_PORT` – jiné porty, když jsou výchozí obsazené.
 */
const PORT = Number(process.env.E2E_PORT ?? 3456);
const PGLITE_PORT = process.env.E2E_PGLITE_PORT ?? "54456";
const external = process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_BASE_URL;
const baseURL = external || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
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
        timeout: 180_000,
        // Vlastní distDir: `next dev` drží zámek ve své složce, druhý server ve stejné by neběžel.
        env: { PGLITE_PORT, PGLITE_DATA_DIR: ".pglite/e2e", NEXT_DIST_DIR: ".next-e2e", PORT: String(PORT) },
      },
  projects: [
    { name: "mobile-360", use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
});
