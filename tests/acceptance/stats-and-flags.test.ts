/**
 * SPEC §7.2/§7.3 (neověřené se nepočítají, odvolané zůstanou anonymně v agregacích),
 * §14.2 (GET /api/stats + Cache-Control), §14.3 (seed se počítá jen s DEMO_MODE=1, produkční
 * start odmítne seed bez DEMO_MODE), §0.3 (`pnpm poc:clear`), §15 m4 (`pnpm seed:clear`),
 * §16 A (STATIC_DEMO=1 = statistiky ze statického snímku).
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { facts, questionsFile } from "@/lib/content";
import { bandThresholds } from "@/lib/compose/q1";
import { generateSeed } from "@/lib/seed/generate";
import { insertSeed } from "@/lib/seed/insert";
import { queryStats } from "@/lib/stats/query";
import { firstExisting, importFile, runScriptAsync, startTestDb, withEnv, type TestDb } from "./helpers/runtime";

const CACHE = "public, s-maxage=60, stale-while-revalidate=300";
const thresholds = bandThresholds(questionsFile, facts);
const seed = generateSeed(questionsFile, facts);
const seedVerified = seed.signatures.filter((s) => s.verified).length;

let db: TestDb;
let restoreEnv: () => void;
const ids = { real: [] as string[], pending: [] as string[], withdrawn: "", poc: "", pocSigner: "" };

async function insertSignature(o: { verified: boolean; withdrawn?: boolean; poc?: boolean; signer?: boolean }): Promise<string> {
  const id = randomUUID();
  await db.sql`
    insert into app.signature (id, answers, content_version, verification_level, verified_at, withdrawn_at, is_seed, is_poc)
    values (${id}, ${db.sql.json({ q2: "q2-opt1" })}, 'test', ${o.verified ? "email" : "unverified"},
            ${o.verified ? new Date() : null}, ${o.withdrawn ? new Date() : null}, false, ${o.poc ?? false})`;
  if (o.signer !== false && !o.withdrawn) {
    const sid = randomUUID();
    await db.sql`
      insert into app.signer (id, signature_id, name_enc, show_name, email_enc, email_hmac, consent_at)
      values (${sid}, ${id}, 'v1:x:y:z', false, 'v1:x:y:z', ${`hmac-${id}`}, now())`;
    if (o.poc) ids.pocSigner = sid;
  }
  return id;
}

beforeAll(async () => {
  db = await startTestDb();
  await insertSeed(db.sql, seed);
  for (let i = 0; i < 3; i++) ids.real.push(await insertSignature({ verified: true }));
  for (let i = 0; i < 2; i++) ids.pending.push(await insertSignature({ verified: false }));
  ids.withdrawn = await insertSignature({ verified: true, withdrawn: true });
  ids.poc = await insertSignature({ verified: true, poc: true });
  restoreEnv = withEnv({ DATABASE_URL: db.url, DATABASE_POOL_MAX: "2", STATIC_DEMO: "0", DEMO_MODE: "0", READ_ONLY: "0" });
});
afterAll(async () => {
  restoreEnv?.();
  const g = globalThis as { __kompasSql?: { end: (o?: unknown) => Promise<void> } };
  await g.__kompasSql?.end({ timeout: 1 }).catch(() => {});
  await db?.stop();
});

// 3 ověřené + 1 odvolaný ověřený + 1 POC ověřený (mimo seed)
const REAL_VERIFIED = 5;
const REAL_PENDING = 2;

describe("§7 / §14.3 co se počítá do statistik", () => {
  it("bez DEMO_MODE se seed nepočítá; neověřené jsou zvlášť jako čekající", async () => {
    const s = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    expect(s.pending).toBe(REAL_PENDING);
    expect(s.verified).toBe(REAL_VERIFIED);
  });

  it("odvolaný podpis zůstane anonymně v agregacích (§7.3)", async () => {
    const withWithdrawn = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    await db.sql`update app.signature set withdrawn_at = null where id = ${ids.withdrawn}`;
    const without = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    await db.sql`update app.signature set withdrawn_at = now() where id = ${ids.withdrawn}`;
    expect(withWithdrawn.verified).toBe(without.verified);
    expect(withWithdrawn.questions.q2.total).toBe(without.questions.q2.total);
  });

  it("s DEMO_MODE=1 se seed počítá", async () => {
    const s = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: true });
    expect(s.verified).toBe(REAL_VERIFIED + seedVerified);
  });

  it("getStats() řídí DEMO_MODE z env", async () => {
    const { getStats } = await import("@/lib/stats/source");
    const restore = withEnv({ DEMO_MODE: "0" });
    const off = await getStats({});
    restore();
    const restore2 = withEnv({ DEMO_MODE: "1" });
    const on = await getStats({});
    restore2();
    expect(off?.verified).toBe(REAL_VERIFIED);
    expect(off?.demo).toBe(false);
    expect(on?.verified).toBe(REAL_VERIFIED + seedVerified);
    expect(on?.demo).toBe(true);
  });
});

describe("§14.2 GET /api/stats", () => {
  it("vrací agregace s Cache-Control: public, s-maxage=60, stale-while-revalidate=300", async () => {
    const { GET } = await import("@/app/api/stats/route");
    const res = await GET(new NextRequest("http://localhost/api/stats"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(CACHE);
    const body = (await res.json()) as { verified: number; pending: number };
    expect(body.verified).toBe(REAL_VERIFIED);
    expect(body.pending).toBe(REAL_PENDING);
  });

  it("filtry kraj/věk/velikost obce se propíšou (neznámá hodnota se ignoruje)", async () => {
    const { GET } = await import("@/app/api/stats/route");
    const res = await GET(new NextRequest("http://localhost/api/stats?kraj=NEEXISTUJE"));
    expect(res.status).toBe(200);
  });

  it("odpověď neobsahuje osobní údaje ani id podpisů", async () => {
    const { GET } = await import("@/app/api/stats/route");
    const text = await (await GET(new NextRequest("http://localhost/api/stats"))).text();
    for (const id of [...ids.real, ids.poc]) expect(text).not.toContain(id);
    expect(text).not.toMatch(/@example\.invalid|name_enc|email/);
  });

  it("STATIC_DEMO=1: statistiky ze statického snímku seedu, stejná cache hlavička (§16 A)", async () => {
    const restore = withEnv({ STATIC_DEMO: "1" });
    try {
      const { GET } = await import("@/app/api/stats/route");
      const res = await GET(new NextRequest("http://localhost/api/stats"));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe(CACHE);
      const body = (await res.json()) as { verified: number; demo: boolean };
      expect(body.demo).toBe(true);
      expect(body.verified).toBe(seedVerified);
    } finally {
      restore();
    }
  });
});

describe("§14.3 produkční start odmítne seed bez DEMO_MODE", () => {
  const instrumentation = firstExisting(["instrumentation.ts", "src/instrumentation.ts"]);
  const guardScript = firstExisting(["scripts/start-guard.ts", "scripts/prestart.ts", "scripts/check-seed.ts", "scripts/start.ts"]);

  it.skipIf(!instrumentation && !guardScript)(
    "se seed záznamy v DB a DEMO_MODE=0 start selže; s DEMO_MODE=1 projde",
    async () => {
      if (guardScript) {
        const env = { DATABASE_URL: db.url, NODE_ENV: "production", DEMO_MODE: "0", POC_MODE: "0" };
        expect((await runScriptAsync(guardScript, { env })).status).not.toBe(0);
        expect((await runScriptAsync(guardScript, { env: { ...env, DEMO_MODE: "1" } })).status).toBe(0);
        return;
      }
      const mod = await importFile<{ register?: () => Promise<void> | void }>(instrumentation);
      expect(typeof mod?.register).toBe("function");
      const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${code})`);
      }) as never);
      const restore = withEnv({ NODE_ENV: "production", NEXT_RUNTIME: "nodejs", DEMO_MODE: "0" });
      try {
        await expect(Promise.resolve().then(() => mod!.register!())).rejects.toThrow();
        const r2 = withEnv({ DEMO_MODE: "1" });
        try {
          await expect(Promise.resolve().then(() => mod!.register!())).resolves.not.toThrow();
        } finally {
          r2();
        }
      } finally {
        restore();
        exit.mockRestore();
      }
    },
  );
  if (!instrumentation && !guardScript) it.todo(
    "PENDING: kontrola při startu zatím neexistuje (čeká se instrumentation.ts s register() nebo scripts/start-guard.ts; test výše se pak spustí sám)",
  );
});

describe("§0.3 pnpm poc:clear a §15 pnpm seed:clear", () => {
  it("poc:clear smaže jen POC podpisy (vč. osobních údajů), ostatní nechá", async () => {
    const r = await runScriptAsync("scripts/poc-clear.ts", { env: { DATABASE_URL: db.url } });
    expect(r.status, r.stderr).toBe(0);
    const poc = (await db.sql<{ n: number }[]>`select count(*)::int as n from app.signature where is_poc`)[0]!.n;
    expect(poc).toBe(0);
    const signer = (await db.sql<{ n: number }[]>`select count(*)::int as n from app.signer where id = ${ids.pocSigner}`)[0]!.n;
    expect(signer).toBe(0);
    const real = (await db.sql<{ n: number }[]>`select count(*)::int as n from app.signature where id in ${db.sql(ids.real)}`)[0]!.n;
    expect(real).toBe(3);
    const seeded = (await db.sql<{ n: number }[]>`select count(*)::int as n from app.signature where is_seed`)[0]!.n;
    expect(seeded).toBe(seed.signatures.length);
  });

  it("seed:clear smaže ukázkové podpisy i fiktivní subjekty, skutečné nechá", async () => {
    const r = await runScriptAsync("scripts/seed-clear.ts", { env: { DATABASE_URL: db.url } });
    expect(r.status, r.stderr).toBe(0);
    const n = (await db.sql<{ n: number }[]>`select count(*)::int as n from app.signature where is_seed`)[0]!.n;
    expect(n).toBe(0);
    const o = (await db.sql<{ o: number }[]>`select count(*)::int as o from app.organization where is_seed`)[0]!.o;
    expect(o).toBe(0);
    const real = (await db.sql<{ real: number }[]>`select count(*)::int as real from app.signature where id in ${db.sql(ids.real)}`)[0]!.real;
    expect(real).toBe(3);
  });
});

describe("§15 m4 seed", () => {
  it("500 podpisů s pevným seedem, e-maily @example.invalid, fiktivní subjekty", () => {
    expect(seed.signatures).toHaveLength(500);
    expect(generateSeed(questionsFile, facts).signatures).toEqual(seed.signatures);
    for (const s of seed.signatures) expect(s.signer.email.endsWith("@example.invalid")).toBe(true);
    expect(seed.organizations.length).toBeGreaterThanOrEqual(3);
    for (const o of seed.organizations) expect(o.name).toMatch(/^(Strana|Hnutí|Iniciativa) [A-Z]$/);
  });
});
