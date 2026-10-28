/**
 * Produkční start odmítne běžet, když jsou v DB ukázková (seed) data a `DEMO_MODE` není
 * zapnutý (SPEC §14.3). Volá se z `instrumentation.ts` → `register()`; výjimka tam zastaví
 * start serveru (Next pak na každý požadavek vrací chybu, `next start` skončí).
 *
 * Nedostupná DB start nezastaví (SPEC §14.2 degradace: statické části mají fungovat dál),
 * jen se zaloguje – kontrola proběhne při dalším studeném startu.
 */
import postgres from "postgres";

export class SeedInProductionError extends Error {
  constructor(public readonly counts: { signatures: number; organizations: number }) {
    super(
      `Produkční start odmítnut: v DB je ${counts.signatures} ukázkových podpisů a ${counts.organizations} ukázkových subjektů (is_seed), ` +
        "ale DEMO_MODE není 1. Smaž je `pnpm seed:clear`, nebo zapni DEMO_MODE=1 (SPEC §14.3).",
    );
    this.name = "SeedInProductionError";
  }
}

const on = (v: string | undefined) => v === "1" || v === "true";

/** Má se kontrola spustit? Jen produkce s DB, mimo build a mimo DEMO_MODE. */
export function shouldCheckSeed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  if (!env.DATABASE_URL) return false;
  if (on(env.DEMO_MODE)) return false;
  return true;
}

export async function countSeedRows(url: string): Promise<{ signatures: number; organizations: number }> {
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 3, idle_timeout: 1, onnotice: () => {} });
  try {
    const [row] = await sql<{ signatures: number; organizations: number }[]>`
      select (select count(*)::int from app.signature where is_seed) as signatures,
             (select count(*)::int from app.organization where is_seed) as organizations`;
    return row ?? { signatures: 0, organizations: 0 };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

export async function assertNoSeedInProduction(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!shouldCheckSeed(env)) return;
  let counts: { signatures: number; organizations: number };
  try {
    counts = await countSeedRows(env.DATABASE_URL!);
  } catch (e) {
    const code = String((e as { code?: string }).code ?? "unknown").slice(0, 40);
    console.error(`[start-guard] kontrola seed dat přeskočena, DB nedostupná (code=${code})`);
    return;
  }
  if (counts.signatures > 0 || counts.organizations > 0) throw new SeedInProductionError(counts);
}
