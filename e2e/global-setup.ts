/**
 * Zahřátí `next dev` před e2e: první návštěva trasy v prohlížeči ji teprve kompiluje (server
 * i klient) a dev server pak otevřené stránce pošle HMR rebuild + full reload. Uprostřed testu
 * to zruší rozjetou navigaci (ERR_ABORTED, klik na odkaz skončí reloadem původní stránky,
 * /overeni se po reloadu ověří podruhé). Jen s E2E_DEV=1.
 */
import { chromium, type FullConfig } from "@playwright/test";
import { demoSignatureId, SPEC_ROUTES_STATIC } from "./acceptance/helpers";

export default async function globalSetup(config: FullConfig) {
  // Jen pro `next dev` (E2E_DEV=1); produkční build a nasazená verze zahřátí nepotřebují.
  if (process.env.E2E_DEV !== "1" || process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_BASE_URL) return;
  const base = config.projects[0]?.use.baseURL;
  if (!base) return;
  const uuid = await demoSignatureId();
  const routes = [
    ...SPEC_ROUTES_STATIC,
    `/v/${uuid}`,
    `/v/${uuid}/srovnani`,
    `/v/${uuid}/zakon`,
    "/overeni/zahrati-neplatny-token",
    "/kompas/podpis/uprava/zahrati-neplatny-token",
    "/org/neplatny-token-0123456789abcdef",
  ];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    for (const r of routes) {
      // Opakuj, dokud se stránka po načtení sama znovu nenačte (HMR full reload).
      for (let attempt = 0; attempt < 4; attempt++) {
        let reloaded = false;
        const onNav = (f: import("@playwright/test").Frame) => {
          if (f === page.mainFrame()) reloaded = true;
        };
        try {
          await page.goto(new URL(r, base).toString(), { timeout: 120_000 });
          await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
          page.on("framenavigated", onNav);
          await page.waitForTimeout(2_500);
        } catch {
          /* zahřátí je best effort */
        } finally {
          page.off("framenavigated", onNav);
        }
        if (!reloaded) break;
      }
    }
  } finally {
    await browser.close();
  }
}
