/**
 * Spouští se jednou při startu serveru (každá instance / studený start funkce).
 * SPEC §14.3: produkční start odmítne seed data bez DEMO_MODE=1 (lib/security/start-guard.ts).
 *
 * Import DB kódu (`postgres` → `net`) musí být uvnitř podmínky na NEXT_RUNTIME, aby ho
 * webpack vypustil z edge kompilace instrumentation (jinak `pnpm dev` hlásí chybu `net`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertNoSeedInProduction } = await import("./lib/security/start-guard");
    await assertNoSeedInProduction();
  }
}
