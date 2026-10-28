import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type postgres from "postgres";
import { CONTENT_VERSION } from "@/lib/content";
import { sha256Hex } from "@/lib/crypto";
import { createSql } from "@/lib/db/client";
import { startPgliteServer, type DevDbServer } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { buildMessage } from "./mailer";
import { createOrReplaceSignature, loadEditable, requestEditLink, verifySignature, withdrawSignature, type SignData } from "./service";
import { formatShortId, SHORT_ID_RE } from "./short-id";

let srv: DevDbServer;
let sql: postgres.Sql;
const prevEnv = { ...process.env };
let GET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  srv = await startPgliteServer({ port: 0 });
  sql = createSql(srv.url, { max: 2 });
  await runMigrations(sql);
  process.env.DATABASE_URL = srv.url; // route handler → getSql()
  process.env.POC_MODE = "0";
  delete process.env.STATIC_DEMO;
  ({ GET } = await import("@/app/api/signature/lookup/route"));
});
afterAll(async () => {
  process.env = { ...prevEnv };
  await sql?.end({ timeout: 1 }).catch(() => {});
  await srv?.stop().catch(() => {});
});

let n = 0;
let ipN = 1;
const data = (over: Partial<SignData> = {}): SignData => ({
  name: "Jana Tajná",
  email: `jana.lookup.${n++}@seznam.cz`,
  showName: true,
  address: "Dlouhá 1, Praha",
  answers: { q2: "q2-opt1", q3: "q3-opt2" },
  contentVersion: CONTENT_VERSION,
  region: "CZ010",
  ageGroup: "30-44",
  municipalitySize: null,
  comment: "Tajný komentář",
  ...over,
});

async function lookup(code: string, ip = `198.51.100.${ipN++}`) {
  const res = await GET(new NextRequest(`http://localhost/api/signature/lookup?code=${encodeURIComponent(code)}`, { headers: { "x-real-ip": ip } }));
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, unknown> };
}

describe("číslo podpisu v DB", () => {
  it("nový podpis dostane číslo; nahrazení stejným e-mailem ho nemění", async () => {
    const d = data();
    const a = await createOrReplaceSignature(sql, d, { poc: false });
    expect(a.shortId).toMatch(SHORT_ID_RE);
    const [row] = await sql<{ short_id: string }[]>`select short_id from app.signature where id = ${a.signatureId}`;
    expect(row!.short_id).toBe(a.shortId);
    const b = await createOrReplaceSignature(sql, { ...d, answers: { q2: "q2-opt2" } }, { poc: false });
    expect(b.signatureId).toBe(a.signatureId);
    expect(b.shortId).toBe(a.shortId);
  });

  it("výchozí hodnota sloupce (seed, ruční SQL) a unikátní index", async () => {
    const [r] = await sql<{ short_id: string }[]>`
      insert into app.signature (answers, content_version, is_seed) values (${sql.json({})}, 'x', true) returning short_id`;
    expect(r!.short_id).toMatch(SHORT_ID_RE);
    await expect(sql`insert into app.signature (answers, content_version, short_id) values (${sql.json({})}, 'x', ${r!.short_id})`).rejects.toMatchObject({ code: "23505" });
    await expect(sql`insert into app.signature (answers, content_version, short_id) values (${sql.json({})}, 'x', 'ABCD-123')`).rejects.toMatchObject({ code: "23514" });
  });

  it("ověřovací e-mail obsahuje číslo podpisu XXXX-XXXX", () => {
    const m = buildMessage("verify", "a@example.invalid", "https://x.test/overeni/abc", "", "7KQ2M9XA");
    expect(m.text).toContain("7KQ2-M9XA");
    expect(m.text).not.toContain("{short_id}");
    expect(m.text).not.toMatch(/\n{3,}/);
  });

  it("ověření a stránka úpravy vrací číslo podpisu", async () => {
    const d = data();
    const r = await createOrReplaceSignature(sql, d, { poc: false });
    const v = await verifySignature(sql, r.verifyToken);
    expect(v).toMatchObject({ status: "ok", shortId: r.shortId });
    const link = await requestEditLink(sql, d.email, { poc: true });
    expect((await loadEditable(sql, link!.editToken))?.shortId).toBe(r.shortId);
  });
});

describe("GET /api/signature/lookup", () => {
  let sig: Awaited<ReturnType<typeof createOrReplaceSignature>>;
  let email: string;
  beforeAll(async () => {
    const d = data();
    email = d.email;
    sig = await createOrReplaceSignature(sql, d, { poc: false });
  });

  it("podle čísla (s pomlčkou, bez, malými písmeny) – jen veřejná data, no-store", async () => {
    for (const code of [formatShortId(sig.shortId), sig.shortId, formatShortId(sig.shortId).toLowerCase()]) {
      const r = await lookup(code);
      expect(r.status, code).toBe(200);
      expect(r.body).toEqual({ uuid: sig.signatureId, short_id: sig.shortId, answers: { q2: "q2-opt1", q3: "q3-opt2" }, content_version: CONTENT_VERSION });
      expect(r.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("žádné osobní údaje ani demografie v odpovědi", async () => {
    const r = await lookup(sig.shortId);
    expect(Object.keys(r.body).sort()).toEqual(["answers", "content_version", "short_id", "uuid"]);
    const text = JSON.stringify(r.body);
    for (const pii of ["Jana", "Tajná", "seznam", "Dlouhá", "komentář", "CZ010", "30-44"]) expect(text).not.toContain(pii);
  });

  it("podle každého tvaru odkazu", async () => {
    const forms = [
      sig.signatureId,
      `https://obcanskykompas.cz/v/${sig.signatureId}`,
      `https://obcanskykompas.cz/v/${sig.signatureId}/zakon`,
      `http://localhost:3000/v/${formatShortId(sig.shortId).toLowerCase()}`,
      `https://obcanskykompas.cz/overeni/${sig.verifyToken}`,
    ];
    for (const code of forms) {
      const r = await lookup(code);
      expect(r.status, code).toBe(200);
      expect(r.body.uuid, code).toBe(sig.signatureId);
    }
  });

  it("ověřovací odkaz se načtením nespotřebuje (ověření pak projde)", async () => {
    const d = data();
    const s = await createOrReplaceSignature(sql, d, { poc: false });
    expect((await lookup(`/overeni/${s.verifyToken}`)).status).toBe(200);
    const [tok] = await sql<{ used_at: Date | null }[]>`select used_at from app.email_token where token_hash = ${sha256Hex(s.verifyToken)}`;
    expect(tok!.used_at).toBeNull();
    expect((await verifySignature(sql, s.verifyToken)).status).toBe("ok");
    // i použitý ověřovací odkaz (e-mail na jiném počítači) dál načte odpovědi
    expect((await lookup(`/overeni/${s.verifyToken}`)).status).toBe(200);
  });

  it("odkaz pro úpravu se načtením nespotřebuje a nedává práva (žádná cookie)", async () => {
    const link = await requestEditLink(sql, email, { poc: true });
    const res = await GET(new NextRequest(`http://localhost/api/signature/lookup?code=${encodeURIComponent(`https://x.cz/kompas/podpis/uprava/${link!.editToken}`)}`, { headers: { "x-real-ip": "198.51.100.250" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    const [tok] = await sql<{ used_at: Date | null }[]>`select used_at from app.email_token where token_hash = ${sha256Hex(link!.editToken)}`;
    expect(tok!.used_at).toBeNull();
    expect(await loadEditable(sql, link!.editToken)).not.toBeNull();
  });

  it("neexistující číslo → 404, nesmysl → 400", async () => {
    expect((await lookup("ZZZZ-ZZZZ")).status).toBe(404);
    expect((await lookup(`/overeni/${"x".repeat(40)}`)).status).toBe(404);
    expect((await lookup("ahoj")).status).toBe(400);
  });

  it("odvolaný podpis → 404 (číslem, UUID i odkazem)", async () => {
    const d = data();
    const s = await createOrReplaceSignature(sql, d, { poc: false });
    const link = await requestEditLink(sql, d.email, { poc: true });
    expect((await lookup(s.shortId)).status).toBe(200);
    expect((await withdrawSignature(sql, link!.editToken)).status).toBe("ok");
    expect((await lookup(s.shortId)).status).toBe(404);
    expect((await lookup(s.signatureId)).status).toBe(404);
    expect((await lookup(`/overeni/${s.verifyToken}`)).status).toBe(404);
  });

  it("rate limit 30/h na IP (počítá i nesmysly)", async () => {
    const ip = "198.51.100.199";
    for (let i = 0; i < 30; i++) expect((await lookup(i % 2 ? "ahoj" : "ZZZZ-ZZZZ", ip)).status).not.toBe(429);
    const r = await lookup(sig.shortId, ip);
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: "rate_limited" });
    expect((await lookup(sig.shortId)).status).toBe(200); // jiná IP
  });
});
