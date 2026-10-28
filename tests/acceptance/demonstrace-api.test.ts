/**
 * SPEC-demonstrace §3, §4.3, §6.4, §7, §9: API online demonstrace nad PGlite – route handlery
 * volané přímo (styl signature-api.test.ts). Moderace (lib/moderation) je tu nahrazená mockem
 * mostu lib/demo/moderation, aby šlo řídit skriptovou kontrolu i zapnutí AI.
 */
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CONTENT_VERSION } from "@/lib/content";
import { createOrReplaceSignature, requestEditLink, type SignData } from "@/lib/sign/service";
import { randomKey, startTestDb, withEnv, type TestDb } from "./helpers/runtime";

const mod = vi.hoisted(() => ({ ai: false, processed: 0 }));
vi.mock("@/lib/demo/moderation", () => ({
  scriptCheck: (text: string) => (/kurva|http|babiš/i.test(text) ? { ok: false } : { ok: true, text }),
  aiEnabled: () => mod.ai,
  enqueueModeration: async (tx: { (s: TemplateStringsArray, ...v: unknown[]): Promise<unknown> }, id: string, field: string, text: string) =>
    tx`insert into app.moderation_job (demonstrator_id, field, text_hash) values (${id}, ${field}, ${createHash("sha256").update(text).digest("hex")})`,
  processModerationJobs: async () => {
    mod.processed++;
    return { processed: 0 };
  },
}));
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
const revalidated = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  // Data cache mimo Next nefunguje – čte se rovnou z DB, tagy se jen zaznamenají.
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: (tag: string) => void revalidated.push(tag),
  revalidatePath: () => {},
  updateTag: () => {},
}));

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const routes = {
  join: () => import("@/app/api/demonstrace/join/route"),
  person: () => import("@/app/api/demonstrace/[id]/route"),
  report: () => import("@/app/api/demonstrace/[id]/report/route"),
  me: () => import("@/app/api/demonstrace/me/route"),
  meta: () => import("@/app/api/demonstrace/meta/route"),
  tile: () => import("@/app/api/demonstrace/tile/[n]/route"),
  owner: () => import("@/app/api/demonstrace/owner/route"),
  revalidate: () => import("@/app/api/demonstrace/revalidate/route"),
  cron: () => import("@/app/api/cron/moderation/route"),
  verify: () => import("@/app/api/sign/verify/route"),
  withdraw: () => import("@/app/api/withdraw/route"),
};

interface Res {
  status: number;
  json: Record<string, unknown>;
  headers: Headers;
}

async function call(
  route: keyof typeof routes,
  method: "GET" | "POST" | "PATCH",
  opts: { body?: unknown; cookie?: string; ip?: string; params?: Record<string, string>; headers?: Record<string, string> } = {},
): Promise<Res> {
  const mod = (await routes[route]()) as unknown as Record<string, Handler>;
  const handler = mod[method]!;
  const ip = opts.ip ?? "198.51.100.7";
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": ip, "x-real-ip": ip, ...opts.headers });
  if (opts.cookie) headers.set("cookie", opts.cookie);
  const req = new NextRequest(`https://kompas.test/api/demonstrace/${route}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
  });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {}, headers: res.headers };
}

let db: TestDb;
let restoreEnv: () => void = () => {};
let k = 0;
let ipN = 20;
const nextIp = () => `203.0.113.${ipN++}`;
const signData = (): SignData => ({
  name: "Jana Testovací",
  email: `demo.api.${Date.now().toString(36)}.${k++}@kompas-test.cz`,
  showName: false,
  address: null,
  answers: { q1: 8.5, q2: "q2-opt1" },
  contentVersion: CONTENT_VERSION,
  region: null,
  ageGroup: null,
  municipalitySize: null,
  comment: null,
});

/** Podpis → POST /api/sign/verify → cookie ok_owner z odpovědi. */
async function owner(): Promise<{ cookie: string; signatureId: string; email: string }> {
  const d = signData();
  const r = await createOrReplaceSignature(db.sql, d, { poc: false });
  const v = await call("verify", "POST", { body: { token: r.verifyToken } });
  expect(v.status).toBe(200);
  const setCookie = v.headers.get("set-cookie") ?? "";
  expect(setCookie).toMatch(/^ok_owner=/);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/Secure/i);
  expect(setCookie).toMatch(/SameSite=Lax/i);
  return { cookie: setCookie.split(";")[0]!, signatureId: r.signatureId, email: d.email };
}

const body = (over: Record<string, unknown> = {}) => ({
  sloganPresetId: "media-nedame",
  pose: "pochoduje",
  signColor: "red",
  seed: 123456789,
  rerollCount: 4,
  consent: true,
  ...over,
});

beforeAll(async () => {
  db = await startTestDb();
  restoreEnv = withEnv({
    DATABASE_URL: db.url,
    DATABASE_POOL_MAX: "1",
    POC_MODE: "0",
    DEMO_MODE: "0",
    STATIC_DEMO: "0",
    READ_ONLY: "0",
    PII_ENCRYPTION_KEY: randomKey(),
    HMAC_KEY: randomKey(),
    CRON_SECRET: "test-cron-secret",
    EMAIL_PROVIDER: "console",
  });
});
afterAll(async () => {
  restoreEnv();
  const g = globalThis as { __kompasSql?: { end: (o?: unknown) => Promise<void> } };
  await g.__kompasSql?.end({ timeout: 1 }).catch(() => {});
  await db?.stop();
});

describe("připojení (§3)", () => {
  it("bez cookie ok_owner 401, neověřený podpis nemá cookie vůbec", async () => {
    expect((await call("join", "POST", { body: body() })).status).toBe(401);
    expect((await call("join", "POST", { body: body(), cookie: "ok_owner=podvrh.1.abc" })).status).toBe(401);
  });

  it("ověřený podpis se připojí → {id, index}; druhé připojení 409 s id; /me vrátí panáčka", async () => {
    const o = await owner();
    const r = await call("join", "POST", { body: body(), cookie: o.cookie, ip: nextIp() });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ ok: true, id: expect.any(String), index: expect.any(Number) });
    const again = await call("join", "POST", { body: body(), cookie: o.cookie, ip: nextIp() });
    expect(again.status).toBe(409);
    expect(again.json).toMatchObject({ error: "exists", id: r.json.id, index: r.json.index });
    const me = await call("me", "GET", { cookie: o.cookie });
    expect(me.json).toMatchObject({ id: r.json.id, index: r.json.index });
    expect(me.headers.get("cache-control")).toContain("no-store");
    expect(revalidated).toContain(`demo-tile:${Math.floor((r.json.index as number) / 1000)}`);
  });

  it("validace: souhlas povinný, seed 32bit, neznámá póza, oba slogany naráz", async () => {
    const o = await owner();
    for (const b of [
      body({ consent: false }),
      body({ seed: 2 ** 32 }),
      body({ pose: "tanci" }),
      body({ sloganCustom: "Ahoj všichni" }),
      body({ sloganPresetId: undefined }),
    ]) {
      const r = await call("join", "POST", { body: b, cookie: o.cookie, ip: nextIp() });
      expect(r.status, JSON.stringify(b)).toBe(400);
    }
    expect((await call("me", "GET", { cookie: o.cookie })).status).toBe(404);
  });

  it("skriptová moderace odmítne 400 {error: moderation} s hláškou ze SPEC, nic se nezapíše", async () => {
    const o = await owner();
    const r = await call("join", "POST", { body: body({ sloganPresetId: undefined, sloganCustom: "k u r v a http" }), cookie: o.cookie, ip: nextIp() });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ error: "moderation", message: "Tento text nelze použít. Zkuste jiný." });
    const n = await call("join", "POST", { body: body({ firstName: "Babiš" }), cookie: o.cookie, ip: nextIp() });
    expect(n.json).toMatchObject({ error: "moderation", field: "firstName" });
    expect((await call("me", "GET", { cookie: o.cookie })).status).toBe(404);
  });

  it("rate limit 10/h na podpis", async () => {
    const o = await owner();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await call("join", "POST", { body: body({ sloganPresetId: undefined, sloganCustom: "kurva" }), cookie: o.cookie, ip: nextIp() })).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("rate limit 20/h na IP", async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const o = await owner();
      statuses.push((await call("join", "POST", { body: body({ sloganPresetId: undefined, sloganCustom: "kurva" }), cookie: o.cookie, ip })).status);
    }
    expect(statuses[20]).toBe(429);
  });
});

describe("dlaždice, meta, karta (§6.4)", () => {
  it("dlaždice: tuple [index, seed, pose, color, slogan, name, id, den], cache hlavičky, meta", async () => {
    const o = await owner();
    const j = await call("join", "POST", { body: body({ sloganPresetId: undefined, sloganCustom: "Za kvalitní zprávy", firstName: "Petra" }), cookie: o.cookie, ip: nextIp() });
    const meta = await call("meta", "GET");
    expect(meta.json).toMatchObject({ count: expect.any(Number), tiles: 1, tileSize: 1000, demo: false });
    expect(meta.headers.get("cache-control")).toBe("public, s-maxage=30, stale-while-revalidate=120");
    const tile = await call("tile", "GET", { params: { n: "0" } });
    expect(tile.headers.get("cache-control")).toBe("public, s-maxage=30, stale-while-revalidate=120");
    const items = tile.json.items as unknown[][];
    const mine = items.find((i) => i[6] === j.json.id)!;
    expect(mine).toEqual([j.json.index, 123456789, "pochoduje", "red", "t:Za kvalitní zprávy", "Petra", j.json.id, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    expect((await call("tile", "GET", { params: { n: "abc" } })).status).toBe(404);
    const beyond = await call("tile", "GET", { params: { n: "5" } });
    expect(beyond.json).toEqual({ n: 5, items: [] });
  });

  it("AI zapnutá: pending → v dlaždici předvolba bez jména; autor vidí own se stavem; cizí ne", async () => {
    mod.ai = true;
    try {
      const o = await owner();
      const before = mod.processed;
      const j = await call("join", "POST", { body: body({ sloganPresetId: undefined, sloganCustom: "Čeká na kontrolu", firstName: "Eva" }), cookie: o.cookie, ip: nextIp() });
      expect(j.status).toBe(201);
      expect(j.json.pending).toEqual(["slogan", "name"]);
      await new Promise((r) => setTimeout(r, 10));
      expect(mod.processed).toBeGreaterThan(before);
      const tile = await call("tile", "GET", { params: { n: "0" } });
      expect(JSON.stringify(tile.json)).not.toContain("Čeká na kontrolu");
      const mine = (tile.json.items as unknown[][]).find((i) => i[6] === j.json.id)!;
      expect(mine[4]).toBe("p:nejsou-jedno");
      expect(mine[5]).toBeNull();

      const own = await call("person", "GET", { params: { id: j.json.id as string }, cookie: o.cookie });
      expect(own.json).toMatchObject({ id: j.json.id, slogan: "p:nejsou-jedno", name: null, own: { sloganCustom: "Čeká na kontrolu", sloganStatus: "pending", nameStatus: "pending" } });
      expect(own.headers.get("cache-control")).toContain("no-store");
      const stranger = await owner();
      const pub = await call("person", "GET", { params: { id: j.json.id as string }, cookie: stranger.cookie });
      expect(pub.json.own).toBeUndefined();
      expect(JSON.stringify(pub.json)).not.toContain("Čeká na kontrolu");
      expect(pub.headers.get("cache-control")).toContain("s-maxage");
      const [job] = await db.sql`select count(*)::int as n from app.moderation_job where demonstrator_id = ${j.json.id as string}`;
      expect(job!.n).toBe(2);
    } finally {
      mod.ai = false;
    }
  });

  it("PATCH: jen vlastník, místo zůstává, revalidace dlaždice a osoby", async () => {
    const o = await owner();
    const j = await call("join", "POST", { body: body(), cookie: o.cookie, ip: nextIp() });
    const id = j.json.id as string;
    const stranger = await owner();
    expect((await call("person", "PATCH", { params: { id }, body: body({ pose: "skace" }), cookie: stranger.cookie, ip: nextIp() })).status).toBe(404);
    expect((await call("person", "PATCH", { params: { id }, body: body({ pose: "skace" }), ip: nextIp() })).status).toBe(401);
    revalidated.length = 0;
    const p = await call("person", "PATCH", { params: { id }, body: body({ pose: "skace", sloganPresetId: "ruce-pryc" }), cookie: o.cookie, ip: nextIp() });
    expect(p.status).toBe(200);
    expect(p.json).toMatchObject({ id, index: j.json.index });
    expect(revalidated).toEqual(expect.arrayContaining([`demo-tile:0`, `demo-person:${id}`]));
    const g = await call("person", "GET", { params: { id } });
    expect(g.json).toMatchObject({ pose: "skace", slogan: "p:ruce-pryc", index: j.json.index });
  });
});

describe("nahlášení (§4.3)", () => {
  it("1 na IP; po 3 různých IP se text a jméno z dlaždice ztratí", async () => {
    const o = await owner();
    const j = await call("join", "POST", { body: body({ sloganPresetId: undefined, sloganCustom: "Sporný slogan", firstName: "Karel" }), cookie: o.cookie, ip: nextIp() });
    const id = j.json.id as string;
    const ipA = nextIp();
    expect((await call("report", "POST", { params: { id }, ip: ipA })).status).toBe(202);
    expect((await call("report", "POST", { params: { id }, ip: ipA })).status).toBe(202);
    await call("report", "POST", { params: { id }, ip: nextIp() });
    let tile = await call("tile", "GET", { params: { n: "0" } });
    expect(JSON.stringify(tile.json)).toContain("Sporný slogan");
    revalidated.length = 0;
    await call("report", "POST", { params: { id }, ip: nextIp() });
    expect(revalidated).toContain("demo-tile:0");
    tile = await call("tile", "GET", { params: { n: "0" } });
    expect(JSON.stringify(tile.json)).not.toContain("Sporný slogan");
    expect(JSON.stringify(tile.json)).not.toContain("Karel");
    const [row] = await db.sql`select report_count, hidden_at is not null as hidden from app.demonstrator where id = ${id}`;
    expect(row).toMatchObject({ report_count: 3, hidden: true });
    const dump = JSON.stringify(await db.sql`select * from app.demonstrator_report`);
    expect(dump).not.toMatch(/203\.0\.113/);
    expect((await call("report", "POST", { params: { id: "00000000-0000-4000-8000-000000000000" }, ip: nextIp() })).status).toBe(404);
  });
});

describe("vlastnictví přes odkaz pro úpravu, odvolání (§3)", () => {
  it("POST /owner {token} nastaví cookie bez spotřebování tokenu; odvolání smaže panáčka", async () => {
    const o = await owner();
    const j = await call("join", "POST", { body: body(), cookie: o.cookie, ip: nextIp() });
    const link = (await requestEditLink(db.sql, o.email, { poc: false }))!;
    const own = await call("owner", "POST", { body: { token: link.editToken }, ip: nextIp() });
    expect(own.status).toBe(200);
    const cookie = (own.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect((await call("me", "GET", { cookie })).json).toMatchObject({ id: j.json.id });
    expect((await call("owner", "POST", { body: { token: "x".repeat(43) }, ip: nextIp() })).status).toBe(404);

    revalidated.length = 0;
    const w = await call("withdraw", "POST", { body: { token: link.editToken } });
    expect(w.status).toBe(200);
    expect(revalidated).toEqual(expect.arrayContaining([`demo-tile:0`, `demo-person:${j.json.id}`, "demo-meta"]));
    expect((await call("person", "GET", { params: { id: j.json.id as string } })).status).toBe(404);
    expect((await call("me", "GET", { cookie })).status).toBe(404);
    expect((await call("join", "POST", { body: body(), cookie, ip: nextIp() })).status).toBe(403);
  });
});

describe("revalidace z CLI", () => {
  it("jen s CRON_SECRET a jen tagy davu", async () => {
    expect((await call("revalidate", "POST", { body: { tags: ["demo-tile:1"] } })).status).toBe(401);
    const auth = { authorization: "Bearer test-cron-secret" };
    expect((await call("revalidate", "POST", { body: { tags: ["sig:xyz", "jiny"] }, headers: auth })).status).toBe(400);
    revalidated.length = 0;
    const r = await call("revalidate", "POST", { body: { tags: ["demo-tile:1", "demo-meta", "sig:xyz"] }, headers: auth });
    expect(r.json).toMatchObject({ ok: true, tags: ["demo-tile:1", "demo-meta"] });
    expect(revalidated).toEqual(["demo-tile:1", "demo-meta"]);
  });
});

describe("cron moderace", () => {
  it("bez CRON_SECRET 401, s ním zpracuje frontu", async () => {
    expect((await call("cron", "GET")).status).toBe(401);
    const before = mod.processed;
    const r = await call("cron", "GET", { headers: { authorization: "Bearer test-cron-secret" } });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, prunedReports: 0 });
    expect(mod.processed).toBe(before + 1);
  });
});

describe("STATIC_DEMO a READ_ONLY (§9)", () => {
  it("STATIC_DEMO: připojení 403, meta a dlaždice ze statického exportu", async () => {
    const restore = withEnv({ STATIC_DEMO: "1" });
    try {
      const o = { cookie: "" };
      expect((await call("join", "POST", { body: body(), cookie: o.cookie })).status).toBe(403);
      const meta = await call("meta", "GET");
      expect(meta.json).toMatchObject({ count: 500, tiles: 1, tileSize: 1000, demo: true });
      const tile = await call("tile", "GET", { params: { n: "0" } });
      const items = tile.json.items as unknown[][];
      expect(items).toHaveLength(500);
      expect(items[0]![0]).toBe(0);
      const p = await call("person", "GET", { params: { id: items[3]![6] as string } });
      expect(p.json).toMatchObject({ index: 3 });
    } finally {
      restore();
    }
  });
  it("READ_ONLY: připojení i nahlášení 503", async () => {
    const restore = withEnv({ READ_ONLY: "1" });
    try {
      expect((await call("join", "POST", { body: body() })).status).toBe(503);
      expect((await call("report", "POST", { params: { id: "00000000-0000-4000-8000-000000000000" } })).status).toBe(503);
    } finally {
      restore();
    }
  });
});
