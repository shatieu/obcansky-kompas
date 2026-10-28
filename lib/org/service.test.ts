import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createSql } from "@/lib/db/client";
import { startPgliteServer, type DevDbServer } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { sha256Hex } from "@/lib/crypto";
import {
  createInvitation,
  findPendingByToken,
  hitOrgLimit,
  InviteError,
  listPublicOrganizations,
  ORG_SUBMIT_LIMIT,
  submitAnswers,
} from "./service";
import { seedOrganizations } from "./source";

let srv: DevDbServer;
let sql: postgres.Sql;

beforeAll(async () => {
  srv = await startPgliteServer({ port: 0 });
  sql = createSql(srv.url, { max: 2 });
  await runMigrations(sql);
});
afterAll(async () => {
  await sql?.end({ timeout: 1 }).catch(() => {});
  await srv?.stop().catch(() => {});
});

describe("strany a hnutí v DB", () => {
  it("pozvánka uloží jen SHA-256 tokenu, odkaz najde subjekt", async () => {
    const inv = await createInvitation(sql, { name: "Žlutá strana", type: "strana", contact: "info@example.invalid" });
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await sql`select token_hash from app.organization where id = ${inv.id}`;
    expect(row!.token_hash).toBe(sha256Hex(inv.token));
    expect(JSON.stringify(row)).not.toContain(inv.token);
    expect(await findPendingByToken(sql, inv.token)).toMatchObject({ name: "Žlutá strana", type: "strana" });
    expect(await findPendingByToken(sql, "B".repeat(43))).toBeNull();
    expect(await findPendingByToken(sql, "neplatny")).toBeNull();
  });

  it("odeslání uzamkne: druhé odeslání i starý odkaz neplatí", async () => {
    const inv = await createInvitation(sql, { name: "Hnutí Čtvrtek", type: "hnuti", contact: "x" });
    const r1 = await submitAnswers(sql, inv.token, { q2: "q2-opt1" }, { q2: "Odůvodnění" });
    expect(r1.ok).toBe(true);
    const r2 = await submitAnswers(sql, inv.token, { q2: "q2-opt6" }, {});
    expect(r2.ok).toBe(false);
    expect(await findPendingByToken(sql, inv.token)).toBeNull();
    const [row] = await sql`select answers, token_hash, submitted_at from app.organization where id = ${inv.id}`;
    expect(row).toMatchObject({ answers: { q2: "q2-opt1" }, token_hash: null });
    expect(row!.submitted_at).not.toBeNull();
  });

  it("duplicitní jméno: bez --reissue chyba, s ním nový odkaz; odeslaný subjekt nejde znovu pozvat", async () => {
    const a = await createInvitation(sql, { name: "Iniciativa Ů", type: "iniciativa", contact: "x" });
    await expect(createInvitation(sql, { name: "iniciativa ů", type: "iniciativa", contact: "x" })).rejects.toBeInstanceOf(InviteError);
    const b = await createInvitation(sql, { name: "Iniciativa Ů", type: "iniciativa", contact: "y" }, { reissue: true });
    expect(b).toMatchObject({ id: a.id, reissued: true });
    expect(await findPendingByToken(sql, a.token)).toBeNull();
    expect(await findPendingByToken(sql, b.token)).not.toBeNull();
    await expect(createInvitation(sql, { name: "Hnutí Čtvrtek", type: "hnuti", contact: "x" }, { reissue: true })).rejects.toMatchObject({
      code: "submitted",
    });
  });

  it("veřejný seznam: abecedně česky, bez kontaktu, seed jen na požádání", async () => {
    await sql`
      insert into app.organization (name, type, contact, token_hash, is_seed, submitted_at, answers)
      values ('Strana A', 'strana', 'ukazka@example.invalid', 'seedhash', true, now(), '{"q2":"q2-opt2"}')`;
    const live = await listPublicOrganizations(sql, { includeSeed: false });
    expect(live.map((o) => o.name)).toEqual(["Hnutí Čtvrtek", "Iniciativa Ů", "Žlutá strana"]);
    expect(JSON.stringify(live)).not.toContain("example.invalid");
    expect(live.find((o) => o.name === "Žlutá strana")).toMatchObject({ submittedAt: null, answers: null });
    const demo = await listPublicOrganizations(sql, { includeSeed: true });
    expect(demo.map((o) => o.name)).toContain("Strana A");
  });

  it("ukázkový subjekt nejde odeslat ani otevřít", async () => {
    const t = "C".repeat(43);
    await sql`insert into app.organization (name, type, token_hash, is_seed) values ('Hnutí B', 'hnuti', ${sha256Hex(t)}, true)`;
    expect(await findPendingByToken(sql, t)).toBeNull();
    expect((await submitAnswers(sql, t, { q2: "q2-opt1" }, {})).ok).toBe(false);
  });

  it("rate limit odeslání na IP", async () => {
    const now = new Date("2026-10-28T10:00:00Z");
    for (let i = 0; i < ORG_SUBMIT_LIMIT.limit; i++) expect(await hitOrgLimit(sql, "203.0.113.9", now)).toBe(true);
    expect(await hitOrgLimit(sql, "203.0.113.9", now)).toBe(false);
    expect(await hitOrgLimit(sql, "203.0.113.10", now)).toBe(true);
  });

  it("STATIC_DEMO: fiktivní subjekty ze seedu, abecedně", () => {
    const list = seedOrganizations();
    expect(list.map((o) => o.name)).toEqual(["Hnutí B", "Iniciativa C", "Strana A"]);
    expect(list.every((o) => o.isSeed)).toBe(true);
    expect(list.find((o) => o.name === "Iniciativa C")).toMatchObject({ submittedAt: null, answers: null });
  });
});
