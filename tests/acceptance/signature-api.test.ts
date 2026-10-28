/**
 * SPEC §7 (podpis, ověření, jeden aktivní podpis na e-mail, odvolání), §0.3 (POC: odkaz na
 * obrazovce, is_poc), §14.2 (READ_ONLY), §14.3 (šifrování, hash tokenů, rate limity,
 * jednorázové domény, logy bez osobních údajů), §16 A (STATIC_DEMO: podpis vypnutý).
 *
 * Volá route handlery přímo nad PGlite. Cesty a tvar těla jsou v helpers/signature-api.ts.
 * Dokud API podpisu neexistuje, jsou testy přeskočené (describe.skipIf) – nikdy falešně zelené.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { facts, questionsFile } from "@/lib/content";
import { bandThresholds } from "@/lib/compose/q1";
import { queryStats } from "@/lib/stats/query";
import { ROOT } from "./helpers/content";
import { randomKey, startTestDb, withEnv, type TestDb } from "./helpers/runtime";
import {
  call,
  extractEditToken,
  extractVerifyToken,
  normaliseResponse,
  routeFile,
  ROUTE_CANDIDATES,
  sign,
  signBody,
  verify,
} from "./helpers/signature-api";

// after() a revalidateTag() mimo Next request scope selžou – v testu je nahradíme.
vi.mock("next/server", async (orig) => {
  const m = await orig<typeof import("next/server")>();
  return {
    ...m,
    after: (task: unknown) => {
      const run = typeof task === "function" ? (task as () => unknown) : () => task;
      void Promise.resolve()
        .then(run)
        .catch(() => {});
    },
  };
});
vi.mock("next/cache", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  revalidateTag: () => {},
  revalidatePath: () => {},
  updateTag: () => {},
}));
vi.mock("next/headers", async (orig) => {
  const store = new Map<string, string>();
  return {
    ...(await orig<Record<string, unknown>>()),
    headers: async () => (globalThis as { __accRequestHeaders?: Headers }).__accRequestHeaders ?? new Headers(),
    cookies: async () => ({
      get: (k: string) => (store.has(k) ? { name: k, value: store.get(k) } : undefined),
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      has: (k: string) => store.has(k),
      set: (k: string, v: string) => void store.set(k, v),
      delete: (k: string) => void store.delete(k),
    }),
  };
});

const SIGN = routeFile("sign");
const VERIFY = routeFile("verify");
const EDIT = routeFile("editLink");
const WITHDRAW = routeFile("withdraw");
const EVENT = routeFile("event");
const reason = (k: keyof typeof ROUTE_CANDIDATES) => `PENDING: route ${k} zatím neexistuje (${ROUTE_CANDIDATES[k].join(" | ")})`;

const thresholds = bandThresholds(questionsFile, facts);
const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const sha256b64 = (s: string) => createHash("sha256").update(s, "utf8").digest("base64");
const sha256b64url = (s: string) => createHash("sha256").update(s, "utf8").digest("base64url");

let db: TestDb;
let restoreEnv: () => void = () => {};
let realFetch: typeof fetch;
let ipCounter = 10;
const nextIp = () => `203.0.113.${ipCounter++}`;
let emailCounter = 0;
const nextEmail = (tag = "u") => `${tag}.${Date.now().toString(36)}.${emailCounter++}@kompas-test.cz`;

const ANSWERS = { q1: 8.5, q2: "q2-opt1", q3: "q3-opt1", q4: "q4-opt1", q5: "q5-opt1", q6: "q6-opt1", q7: ["q7-opt2"], q8: "q8-opt1" };

async function dumpApp(): Promise<string> {
  const tables = await db.sql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'app' and table_type = 'BASE TABLE'`;
  let out = "";
  for (const { table_name } of tables) {
    const rows = await db.sql.unsafe(`select row_to_json(t)::text as j from app."${table_name}" t`);
    out += rows.map((r) => (r as unknown as { j: string }).j).join("\n") + "\n";
  }
  return out;
}
const count = async (q: string) => Number((await db.sql.unsafe(q))[0]!.n);

beforeAll(async () => {
  db = await startTestDb();
  restoreEnv = withEnv({
    DATABASE_URL: db.url,
    DATABASE_POOL_MAX: "2",
    POC_MODE: "1",
    DEMO_MODE: "0",
    STATIC_DEMO: "0",
    READ_ONLY: "0",
    PII_ENCRYPTION_KEY: randomKey(),
    HMAC_KEY: randomKey(),
    CRON_SECRET: "test-cron-secret",
    EMAIL_PROVIDER: "console",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  });
  // Turnstile siteverify bez sítě: testovací klíč vždy projde.
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("challenges.cloudflare.com")) return Response.json({ success: true, "error-codes": [], hostname: "localhost" });
    return realFetch(input, init);
  }) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  restoreEnv();
  const g = globalThis as { __kompasSql?: { end: (o?: unknown) => Promise<void> } };
  await g.__kompasSql?.end({ timeout: 1 }).catch(() => {});
  await db?.stop();
});

describe.skipIf(!SIGN)("§7.1 / §7.2 podpis", () => {
  it("platný podpis → 2xx, záznam unverified, is_poc v POC režimu, content_version", async () => {
    const before = await count("select count(*)::int as n from app.signature");
    const r = await sign({ name: "Jana Testovací", email: nextEmail(), answers: ANSWERS }, nextIp());
    expect(r.status, r.text).toBeLessThan(300);
    expect(await count("select count(*)::int as n from app.signature")).toBe(before + 1);
    const [row] = await db.sql<{ verification_level: string; is_poc: boolean; content_version: string; verified_at: Date | null }[]>`
      select verification_level, is_poc, content_version, verified_at from app.signature order by created_at desc limit 1`;
    expect(row!.verification_level).toBe("unverified");
    expect(row!.verified_at).toBeNull();
    expect(row!.is_poc).toBe(true);
    expect(row!.content_version).toBeTruthy();
  });

  it("§0.3 POC: odpověď obsahuje ověřovací odkaz /overeni/<token> (místo e-mailu)", async () => {
    const r = await sign({ name: "Petr Testovací", email: nextEmail(), answers: ANSWERS }, nextIp());
    expect(extractVerifyToken(r.text)).toBeTruthy();
  });

  it("neověřený podpis se do statistik nepočítá, jen jako čekající", async () => {
    const before = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    await sign({ name: "Eva Čekající", email: nextEmail(), answers: ANSWERS }, nextIp());
    const after = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    expect(after.verified).toBe(before.verified);
    expect(after.pending).toBe(before.pending + 1);
  });

  it("povinné: jméno, e-mail, souhlas se zpracováním politického názoru (čl. 9 GDPR)", async () => {
    const before = await count("select count(*)::int as n from app.signature");
    const noConsent = await sign({ name: "Bez Souhlasu", email: nextEmail(), answers: ANSWERS, consent: false }, nextIp());
    const noName = await sign({ name: "", email: nextEmail(), answers: ANSWERS }, nextIp());
    const badEmail = await sign({ name: "Špatný Email", email: "neni-email", answers: ANSWERS }, nextIp());
    for (const r of [noConsent, noName, badEmail]) expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await count("select count(*)::int as n from app.signature")).toBe(before);
  });

  it("komentář nad 500 znaků se odmítne (§5.3)", async () => {
    const r = await sign({ name: "Dlouhý Komentář", email: nextEmail(), answers: ANSWERS, comment: "a".repeat(501) }, nextIp());
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe.skipIf(!SIGN)("§14.3 šifrování a tokeny", () => {
  const name = "Zdeňka Šifrovaná";
  const email = `sifra.${Date.now()}@kompas-test.cz`;
  const address = "Křižíkova 12, 186 00 Praha";
  let responseText = "";

  beforeAll(async () => {
    const r = await sign({ name, email, address, answers: ANSWERS }, nextIp());
    responseText = r.text;
  });

  it("jméno, e-mail ani adresa nejsou v DB v otevřené podobě", async () => {
    const dump = await dumpApp();
    expect(dump).not.toContain(name);
    expect(dump).not.toContain(email);
    expect(dump.toLowerCase()).not.toContain(email.toLowerCase());
    expect(dump).not.toContain("Křižíkova");
  });

  it("e-mail se nikdy nevrací v odpovědi", () => {
    expect(responseText).not.toContain(email);
  });

  it("ověřovací token je v DB jen jako SHA-256 hash", async () => {
    const token = extractVerifyToken(responseText);
    expect(token).toBeTruthy();
    const dump = await dumpApp();
    expect(dump).not.toContain(token!);
    const hashes = await db.sql<{ token_hash: string }[]>`select token_hash from app.email_token`;
    const known = new Set(hashes.map((h) => h.token_hash));
    expect(known.has(sha256hex(token!)) || known.has(sha256b64(token!)) || known.has(sha256b64url(token!))).toBe(true);
  });

  it("ověřovací odkaz platí 7 dní", async () => {
    const token = extractVerifyToken(responseText)!;
    const rows = await db.sql<{ expires_at: Date; purpose: string }[]>`
      select expires_at, purpose from app.email_token where token_hash in (${sha256hex(token)}, ${sha256b64(token)}, ${sha256b64url(token)})`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.purpose).toBe("verify");
    const days = (new Date(rows[0]!.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.95);
    expect(days).toBeLessThan(7.05);
  });

  it("logy neobsahují osobní údaje", async () => {
    const logged: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" "))),
    );
    const e = nextEmail("log");
    try {
      await sign({ name: "Logovaný Člověk", email: e, address: "Logová 1", answers: ANSWERS }, "192.0.2.77");
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    const all = logged.join("\n");
    expect(all).not.toContain(e);
    expect(all).not.toContain("Logovaný Člověk");
    expect(all).not.toContain("Logová 1");
    expect(all).not.toContain("192.0.2.77");
  });
});

describe.skipIf(!SIGN)("§7.2 jeden e-mail = jeden aktivní podpis, stejná odpověď", () => {
  it("odpověď API je stejná, ať e-mail existoval, nebo ne", async () => {
    const existing = nextEmail("dup");
    await sign({ name: "Původní", email: existing, answers: ANSWERS }, nextIp());
    const again = await sign({ name: "Původní", email: existing, answers: { ...ANSWERS, q2: "q2-opt2" } }, nextIp());
    const fresh = await sign({ name: "Původní", email: nextEmail("fresh"), answers: { ...ANSWERS, q2: "q2-opt2" } }, nextIp());
    expect(again.status).toBe(fresh.status);
    expect(normaliseResponse(again.text)).toBe(normaliseResponse(fresh.text));
  });

  it("nový podpis ze stejného e-mailu nahradí starý; historie v signature_version", async () => {
    const email = nextEmail("replace");
    const signersBefore = await count("select count(*)::int as n from app.signer");
    await sign({ name: "Nahrazovaný", email, answers: { ...ANSWERS, q1: 5.3 } }, nextIp());
    await sign({ name: "Nahrazovaný", email, answers: { ...ANSWERS, q1: 11.7 } }, nextIp());
    expect(await count("select count(*)::int as n from app.signer")).toBe(signersBefore + 1);
    const active = await count(`
      select count(*)::int as n from app.signature s join app.signer r on r.signature_id = s.id
      where s.withdrawn_at is null and (s.answers->>'q1')::numeric in (5.3, 11.7)`);
    expect(active).toBe(1);
    const history = await count(`select count(*)::int as n from app.signature_version where (answers->>'q1')::numeric = 5.3`);
    expect(history).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!SIGN)("§14.3 rate limity a blokace", () => {
  it("podpis max. 5/h na IP (6. požadavek → 429)", async () => {
    const ip = "198.18.0.5";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await sign({ name: "Limit IP", email: nextEmail("ip"), answers: ANSWERS }, ip)).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("podpis max. 3/h na e-mail (4. požadavek → 429)", async () => {
    const email = nextEmail("mail");
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await sign({ name: "Limit Mail", email, answers: ANSWERS }, nextIp())).status);
    expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
    expect(statuses[3]).toBe(429);
  });

  it("IP se ukládá jen jako HMAC (žádná IP v otevřené podobě v DB)", async () => {
    const dump = await dumpApp();
    expect(dump).not.toMatch(/198\.18\.0\.5|203\.0\.113\.\d+/);
  });

  it("jednorázové e-mailové domény se odmítnou a nic se neuloží", async () => {
    const before = await count("select count(*)::int as n from app.signature");
    for (const domain of ["mailinator.com", "10minutemail.com", "guerrillamail.com", "yopmail.com"]) {
      const r = await sign({ name: "Jednorázový", email: `x${emailCounter++}@${domain}`, answers: ANSWERS }, nextIp());
      expect(r.status, domain).toBeGreaterThanOrEqual(400);
    }
    expect(await count("select count(*)::int as n from app.signature")).toBe(before);
  });

  it("seznam jednorázových domén je statický soubor v repu", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|json|txt|ya?ml)$/.test(f) && readFileSync(p, "utf8").includes("mailinator.com")) hits.push(p);
      }
    };
    for (const d of ["lib", "data", "content"]) walk(path.join(ROOT, d));
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!SIGN)("§14.2 READ_ONLY=1 a §16 A STATIC_DEMO=1", () => {
  it("READ_ONLY=1 vypne zápis s oznámením", async () => {
    const before = await count("select count(*)::int as n from app.signature");
    const restore = withEnv({ READ_ONLY: "1" });
    try {
      const r = await sign({ name: "Jen Čtení", email: nextEmail("ro"), answers: ANSWERS }, nextIp());
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.text.length).toBeGreaterThan(0);
    } finally {
      restore();
    }
    expect(await count("select count(*)::int as n from app.signature")).toBe(before);
  });

  it("STATIC_DEMO=1: podpis je vypnutý s hláškou „V ukázce zatím nelze podepsat“", async () => {
    const before = await count("select count(*)::int as n from app.signature");
    const restore = withEnv({ STATIC_DEMO: "1" });
    try {
      const r = await sign({ name: "Ukázka", email: nextEmail("static"), answers: ANSWERS }, nextIp());
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.text).toContain("V ukázce zatím nelze podepsat");
    } finally {
      restore();
    }
    expect(await count("select count(*)::int as n from app.signature")).toBe(before);
  });
});

describe.skipIf(!SIGN || !VERIFY)("§7.2 ověření", () => {
  it("ověření přepne na úroveň email, započte se do statistik; token je jednorázový", async () => {
    const r = await sign({ name: "Ověřovaný", email: nextEmail("ver"), answers: { ...ANSWERS, q1: 6.6 } }, nextIp());
    const token = extractVerifyToken(r.text)!;
    const before = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    const v = await verify(token);
    expect(v.status).toBeLessThan(400);
    const after = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    expect(after.verified).toBe(before.verified + 1);
    const [row] = await db.sql<{ verification_level: string; verified_at: Date | null }[]>`
      select verification_level, verified_at from app.signature where (answers->>'q1')::numeric = 6.6`;
    expect(row!.verification_level).toBe("email");
    expect(row!.verified_at).not.toBeNull();
    const again = await verify(token);
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  it("token starší 7 dní neplatí", async () => {
    const r = await sign({ name: "Prošlý", email: nextEmail("exp"), answers: ANSWERS }, nextIp());
    const token = extractVerifyToken(r.text)!;
    await db.sql`update app.email_token set expires_at = now() - interval '1 minute'
      where token_hash in (${sha256hex(token)}, ${sha256b64(token)}, ${sha256b64url(token)})`;
    const v = await verify(token);
    expect(v.status).toBeGreaterThanOrEqual(400);
  });
});
if (!VERIFY) describe("§7.2 ověření", () => it.todo(reason("verify")));

describe.skipIf(!SIGN || !EDIT)("§7.3 / §14.3 žádost o odkaz pro úpravu", () => {
  it("stejná odpověď pro existující i neexistující e-mail", async () => {
    const email = nextEmail("edit");
    await sign({ name: "Upravující", email, answers: ANSWERS }, nextIp());
    const a = await call("editLink", "POST", { email, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }, { ip: nextIp() });
    const b = await call("editLink", "POST", { email: nextEmail("nobody"), turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }, { ip: nextIp() });
    expect(a.status).toBe(b.status);
    expect(normaliseResponse(a.text).replace(/\/[a-z-]+\/<token>/g, "")).toBe(normaliseResponse(b.text).replace(/\/[a-z-]+\/<token>/g, ""));
  });
  it("max. 3/h na e-mail (4. → 429)", async () => {
    const email = nextEmail("edit-limit");
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await call("editLink", "POST", { email, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }, { ip: nextIp() })).status);
    expect(statuses[3]).toBe(429);
  });
});
if (!EDIT) describe("§7.3 žádost o odkaz pro úpravu", () => it.todo(reason("editLink")));

describe.skipIf(!SIGN || !VERIFY || !EDIT || !WITHDRAW)("§7.3 odvolání", () => {
  it("smaže osobní údaje, odpověď zůstane anonymně v agregacích, UUID zůstává", async () => {
    const email = nextEmail("wd");
    const name = "Odvolávající Osoba";
    const r = await sign({ name, email, answers: { ...ANSWERS, q1: 6.9 } }, nextIp());
    await verify(extractVerifyToken(r.text)!);
    const [sig] = await db.sql<{ id: string }[]>`select id from app.signature where (answers->>'q1')::numeric = 6.9`;
    const before = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    const link = await call("editLink", "POST", { email, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" }, { ip: nextIp() });
    const editToken = extractEditToken(link.text);
    expect(editToken, "POC: odkaz pro úpravu se ukáže v odpovědi").toBeTruthy();
    const w = await call("withdraw", "POST", { token: editToken }, { ip: nextIp() });
    expect(w.status).toBeLessThan(400);
    const signers = await count(`select count(*)::int as n from app.signer where signature_id = '${sig!.id}' and (name_enc <> '' or email_enc <> '')`);
    expect(signers).toBe(0);
    const [after] = await db.sql<{ id: string; withdrawn_at: Date | null }[]>`select id, withdrawn_at from app.signature where id = ${sig!.id}`;
    expect(after?.id).toBe(sig!.id);
    expect(after?.withdrawn_at).not.toBeNull();
    const stats = await queryStats(db.sql, { filters: {}, thresholds, includeSeed: false });
    expect(stats.verified).toBe(before.verified);
  });
});
if (!WITHDRAW) describe("§7.3 odvolání", () => it.todo(reason("withdraw")));

describe.skipIf(!EVENT)("§9.2 / §9.3 anonymní události", () => {
  it("letter_prepared a frame_downloaded zvýší event_counter, nic dalšího se neuloží", async () => {
    const secret = "TAJNY-OBSAH-DOPISU-123";
    const a = await call("event", "POST", { kind: "letter_prepared", key: "poslanec", type: "poslanec", text: secret }, { ip: nextIp() });
    const b = await call("event", "POST", { kind: "frame_downloaded", key: "ribbon:ruce-pryc", variant: "ribbon", slogan: "ruce-pryc" }, { ip: nextIp() });
    expect(a.status).toBeLessThan(400);
    expect(b.status).toBeLessThan(400);
    const rows = await db.sql<{ kind: string; count: number }[]>`select kind, count from app.event_counter`;
    expect(rows.some((r) => r.kind === "letter_prepared" && r.count >= 1)).toBe(true);
    expect(rows.some((r) => r.kind === "frame_downloaded" && r.count >= 1)).toBe(true);
    expect(await dumpApp()).not.toContain(secret);
  });
  it("neznámý druh události se odmítne", async () => {
    const r = await call("event", "POST", { kind: "cokoli", key: "x" }, { ip: nextIp() });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
if (!EVENT) describe("§9.2 / §9.3 anonymní události", () => it.todo(reason("event")));

if (!SIGN) describe("§7 podpis", () => it.todo(reason("sign")));

// Tělo požadavku je v adaptéru; tady jen kontrola, že adaptér posílá pole ze SPEC §7.1.
describe("adaptér", () => {
  it("tělo podpisu nese jméno, e-mail, zobrazit jméno, adresu, souhlas, odpovědi a Turnstile", () => {
    const b = signBody({ name: "A", email: "a@b.cz", answers: {} });
    for (const k of ["name", "email", "showName", "consent", "answers", "turnstileToken"]) expect(b).toHaveProperty(k);
  });
});
