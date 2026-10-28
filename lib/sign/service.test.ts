import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import { CONTENT_VERSION } from "@/lib/content";
import { sha256Hex } from "@/lib/crypto";
import { createSql } from "@/lib/db/client";
import { startPgliteServer, type DevDbServer } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { hit } from "@/lib/rate-limit";
import { backoffSeconds, processDueJobs } from "./mailer";
import { loadPublicSignature } from "./read";
import { applyEdit, createOrReplaceSignature, loadEditable, requestEditLink, verifySignature, withdrawSignature, type SignData } from "./service";

let srv: DevDbServer;
let sql: postgres.Sql;
const prevEnv = { ...process.env };

beforeAll(async () => {
  srv = await startPgliteServer({ port: 0 });
  sql = createSql(srv.url, { max: 2 });
  await runMigrations(sql);
  process.env.POC_MODE = "0";
  process.env.EMAIL_PROVIDER = "console";
});
afterAll(async () => {
  process.env = { ...prevEnv };
  await sql?.end({ timeout: 1 }).catch(() => {});
  await srv?.stop().catch(() => {});
});

let n = 0;
const data = (over: Partial<SignData> = {}): SignData => ({
  name: "Jana Nováková",
  email: `jana.${n++}@seznam.cz`,
  showName: false,
  address: "Dlouhá 1, Praha",
  answers: { q1: 8.5, q2: "q2-opt1" },
  contentVersion: CONTENT_VERSION,
  region: "CZ010",
  ageGroup: null,
  municipalitySize: null,
  comment: "Můj komentář",
  ...over,
});

describe("podpis v DB", () => {
  it("nový podpis: unverified, šifrované údaje, hash tokenu, úloha čeká na after()", async () => {
    const d = data();
    const r = await createOrReplaceSignature(sql, d, { poc: false });
    expect(r.replaced).toBe(false);
    const [s] = await sql`select verification_level, is_poc from app.signature where id = ${r.signatureId}`;
    expect(s).toMatchObject({ verification_level: "unverified", is_poc: false });
    const [signer] = await sql`select name_enc, email_enc, address_enc from app.signer where id = ${r.signerId}`;
    expect(JSON.stringify(signer)).not.toContain("Jana");
    expect(JSON.stringify(signer)).not.toContain("seznam");
    const [tok] = await sql`select purpose from app.email_token where token_hash = ${sha256Hex(r.verifyToken)}`;
    expect(tok?.purpose).toBe("verify");
    const [job] = await sql<{ status: string; due_later: boolean }[]>`
      select status, next_attempt_at > now() as due_later from app.email_job where id = ${r.jobId}`;
    expect(job).toMatchObject({ status: "pending", due_later: true });
  });

  it("stejný e-mail nahradí podpis (stejné UUID, historie, znovu unverified, starý token neplatí)", async () => {
    const d = data();
    const a = await createOrReplaceSignature(sql, d, { poc: true });
    expect((await verifySignature(sql, a.verifyToken)).status).toBe("ok");
    const b = await createOrReplaceSignature(sql, { ...d, answers: { q2: "q2-opt2" } }, { poc: true });
    expect(b.replaced).toBe(true);
    expect(b.signatureId).toBe(a.signatureId);
    const [s] = await sql`select answers, verification_level from app.signature where id = ${a.signatureId}`;
    expect(s).toMatchObject({ answers: { q2: "q2-opt2" }, verification_level: "unverified" });
    const hist = await sql`select answers from app.signature_version where signature_id = ${a.signatureId}`;
    expect(hist.map((h) => h.answers)).toContainEqual({ q1: 8.5, q2: "q2-opt1" });
    expect((await verifySignature(sql, b.verifyToken)).status).toBe("ok");
    expect((await verifySignature(sql, b.verifyToken)).status).toBe("used");
  });

  it("ověření: neplatný a prošlý token", async () => {
    expect((await verifySignature(sql, "x".repeat(43))).status).toBe("invalid");
    const r = await createOrReplaceSignature(sql, data(), { poc: true });
    await sql`update app.email_token set expires_at = now() - interval '1 second' where token_hash = ${sha256Hex(r.verifyToken)}`;
    expect((await verifySignature(sql, r.verifyToken)).status).toBe("expired");
  });

  it("veřejná data: jméno jen se souhlasem, nikdy e-mail ani adresa", async () => {
    const hidden = await createOrReplaceSignature(sql, data(), { poc: true });
    const shown = await createOrReplaceSignature(sql, data({ showName: true }), { poc: true });
    const h = await loadPublicSignature(sql, hidden.signatureId);
    const s = await loadPublicSignature(sql, shown.signatureId);
    expect(h?.name).toBeNull();
    expect(s?.name).toBe("Jana Nováková");
    expect(JSON.stringify([h, s])).not.toMatch(/seznam|Dlouhá/);
    expect(await loadPublicSignature(sql, "neni-uuid")).toBeNull();
  });

  it("úprava odkazem: token se nespotřebuje zobrazením, jen uložením; ověří e-mail", async () => {
    const d = data();
    const r = await createOrReplaceSignature(sql, d, { poc: true });
    expect(await requestEditLink(sql, "nikdo@seznam.cz", { poc: true })).toBeNull();
    const link = (await requestEditLink(sql, d.email.toUpperCase(), { poc: true }))!;
    expect(link.signatureId).toBe(r.signatureId);
    expect((await loadEditable(sql, link.editToken))?.answers).toEqual(d.answers);
    expect(await loadEditable(sql, link.editToken)).not.toBeNull();
    const e = await applyEdit(sql, link.editToken, {
      answers: { q2: "q2-opt3" },
      contentVersion: CONTENT_VERSION,
      region: null,
      ageGroup: "18-29",
      municipalitySize: null,
      comment: null,
      showName: true,
    });
    expect(e).toEqual({ status: "ok", signatureId: r.signatureId });
    const [s] = await sql`select answers, verification_level, age_group from app.signature where id = ${r.signatureId}`;
    expect(s).toMatchObject({ answers: { q2: "q2-opt3" }, verification_level: "email", age_group: "18-29" });
    expect(await loadEditable(sql, link.editToken)).toBeNull();
    expect((await applyEdit(sql, link.editToken, { answers: {}, contentVersion: CONTENT_VERSION, region: null, ageGroup: null, municipalitySize: null, comment: null, showName: false })).status).toBe("used");
  });

  it("odvolání smaže signer i komentář, podpis zůstane anonymně; e-mail lze použít znovu", async () => {
    const d = data();
    const r = await createOrReplaceSignature(sql, d, { poc: true });
    const link = (await requestEditLink(sql, d.email, { poc: true }))!;
    expect((await withdrawSignature(sql, link.editToken)).status).toBe("ok");
    expect((await sql`select 1 from app.signer where signature_id = ${r.signatureId}`).length).toBe(0);
    const [s] = await sql`select withdrawn_at, comment, answers from app.signature where id = ${r.signatureId}`;
    expect(s!.withdrawn_at).not.toBeNull();
    expect(s!.comment).toBeNull();
    expect(s!.answers).toEqual(d.answers);
    expect(await requestEditLink(sql, d.email, { poc: true })).toBeNull();
    const again = await createOrReplaceSignature(sql, d, { poc: true });
    expect(again.signatureId).not.toBe(r.signatureId);
  });
});

describe("fronta e-mailů (cron)", () => {
  it("pošle splatné úlohy s novým tokenem, ověřené přeskočí", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...a: unknown[]) => void logs.push(a.join(" ")));
    try {
      const d = data();
      const pending = await createOrReplaceSignature(sql, d, { poc: false });
      const verified = await createOrReplaceSignature(sql, data(), { poc: false });
      await verifySignature(sql, verified.verifyToken);
      await sql`update app.email_job set next_attempt_at = now() - interval '1 second' where id in ${sql([pending.jobId, verified.jobId])}`;
      const out = await processDueJobs(sql, "http://localhost:3000");
      expect(out.sent).toBeGreaterThanOrEqual(1);
      expect(out.skipped).toBeGreaterThanOrEqual(1);
      const [job] = await sql`select status, attempts from app.email_job where id = ${pending.jobId}`;
      expect(job).toMatchObject({ status: "sent", attempts: 1 });
      // Původní token (z after()) už neplatí – cron vydal nový.
      expect((await verifySignature(sql, pending.verifyToken)).status).toBe("invalid");
      expect(logs.join("\n")).not.toContain(d.email);
    } finally {
      spy.mockRestore();
    }
  });

  it("v POC se nic neposílá", async () => {
    process.env.POC_MODE = "1";
    try {
      expect(await processDueJobs(sql, "http://localhost:3000")).toEqual({ sent: 0, failed: 0, skipped: 0 });
    } finally {
      process.env.POC_MODE = "0";
    }
  });

  it("backoff roste a je omezený", () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffSeconds)).toEqual([60, 180, 540, 1620, 4860, 4860]);
  });
});

describe("rate limit v DB", () => {
  it("5. pokus projde, 6. ne; jiný klíč má vlastní počítadlo", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await hit(sql, "signPerIp", "test-key")).allowed);
    expect(results).toEqual([true, true, true, true, true, false]);
    expect((await hit(sql, "signPerIp", "jiny-klic")).allowed).toBe(true);
  });
});
