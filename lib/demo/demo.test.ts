import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { CONTENT_VERSION } from "@/lib/content";
import { sha256Hex } from "@/lib/crypto";
import { createSql } from "@/lib/db/client";
import { startPgliteServer, type DevDbServer } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { hit } from "@/lib/rate-limit";
import { createOrReplaceSignature, requestEditLink, verifySignature, withdrawSignature, type SignData } from "@/lib/sign/service";
import { scriptCheck } from "@/lib/moderation/script";
import { POSES, SIGN_COLORS, TILE_SIZE, type TileItem } from "./constants";
import { OWNER_COOKIE, getOwnerSignatureId, signOwnerValue, verifyOwnerValue } from "./owner";
import { demoInputSchema } from "./input";
import {
  editDemonstrator,
  findBySignature,
  joinDemonstration,
  listReported,
  moderateDemonstrator,
  nextStatus,
  reportDemonstrator,
  signatureFromEditToken,
  type DemoWrite,
  type Enqueue,
} from "./service";
import { clearDemoSeed, generateDemoSeed, insertDemoSeed, writeStaticExport } from "./seed";
import { loadDemoSlogans } from "./slogans-schema";
import { publicName, publicSlogan, queryMeta, queryOwn, queryTileRows, shapeTileItem, type DemoRow } from "./tiles";

const slogans = loadDemoSlogans();
const shapeOpts = { defaultPresetId: slogans.default, isPresetId: (id: string) => slogans.presets.some((p) => p.id === id) };

// ---------- čisté funkce ----------

describe("owner cookie ok_owner", () => {
  const id = "0b7c8a3e-2f7d-4c1b-9a51-8d3c2e1f0a9b";
  it("podepsaná hodnota se ověří na id podpisu", () => {
    expect(verifyOwnerValue(signOwnerValue(id))).toBe(id);
    expect(getOwnerSignatureId({ get: (n) => (n === OWNER_COOKIE ? { value: signOwnerValue(id) } : undefined) })).toBe(id);
    expect(getOwnerSignatureId({ cookies: { get: () => undefined } })).toBeNull();
  });
  it("podvržené id, poškozený podpis i prošlá cookie neprojdou", () => {
    const v = signOwnerValue(id);
    const [, exp, sig] = v.split(".");
    expect(verifyOwnerValue(`1b7c8a3e-2f7d-4c1b-9a51-8d3c2e1f0a9b.${exp}.${sig}`)).toBeNull();
    expect(verifyOwnerValue(`${id}.${exp}.${"0".repeat(64)}`)).toBeNull();
    expect(verifyOwnerValue(`${id}.${Number(exp) + 1}.${sig}`)).toBeNull();
    expect(verifyOwnerValue(v, Date.now() + 366 * 24 * 3600 * 1000)).toBeNull();
    expect(verifyOwnerValue("garbage")).toBeNull();
    expect(verifyOwnerValue(undefined)).toBeNull();
  });
});

describe("vstup připojení", () => {
  const base = { pose: "drzi", signColor: "blue", seed: 123, rerollCount: 3, consent: true };
  it("právě jeden slogan, známá předvolba, seed 32bit, rerollCount se ořízne na 20", () => {
    expect(demoInputSchema.safeParse({ ...base, sloganPresetId: "ruce-pryc" }).success).toBe(true);
    expect(demoInputSchema.safeParse({ ...base }).success).toBe(false);
    expect(demoInputSchema.safeParse({ ...base, sloganPresetId: "ruce-pryc", sloganCustom: "Ahoj světe" }).success).toBe(false);
    expect(demoInputSchema.safeParse({ ...base, sloganPresetId: "neexistuje" }).success).toBe(false);
    expect(demoInputSchema.safeParse({ ...base, sloganPresetId: "ruce-pryc", seed: 2 ** 32 }).success).toBe(false);
    expect(demoInputSchema.safeParse({ ...base, sloganPresetId: "ruce-pryc", seed: -1 }).success).toBe(false);
    expect(demoInputSchema.safeParse({ ...base, sloganPresetId: "ruce-pryc", consent: false }).success).toBe(false);
    expect(demoInputSchema.safeParse({ ...base, sloganCustom: "x".repeat(41) }).success).toBe(false);
    const r = demoInputSchema.safeParse({ ...base, sloganPresetId: "ruce-pryc", rerollCount: 99, firstName: "  " });
    expect(r.success && r.data.rerollCount).toBe(20);
    expect(r.success && r.data.firstName).toBeNull();
  });
});

describe("tvar dlaždice nikdy neprozradí neschválený text", () => {
  const row = (over: Partial<DemoRow>): DemoRow => ({
    id: "x",
    position_index: 7,
    seed: "4294967295",
    pose: "pest",
    sign_color: "red",
    slogan_preset_id: null,
    slogan_custom: "Tajný text",
    slogan_status: "approved",
    first_name: "Jana",
    name_status: "approved",
    hidden_at: null,
    created_at: "2026-10-27T23:30:00Z",
    ...over,
  });
  it("schválené a neskryté projde, seed je číslo, den v pražském čase", () => {
    const it0 = shapeTileItem(row({}), shapeOpts);
    expect(it0).toEqual([7, 4294967295, "pest", "red", "t:Tajný text", "Jana", "x", "2026-10-28"]);
  });
  for (const st of ["pending", "rejected", "none"] as const) {
    it(`slogan ${st} → výchozí předvolba, jméno ${st} → null`, () => {
      const t = shapeTileItem(row({ slogan_status: st, name_status: st }), shapeOpts);
      expect(t[4]).toBe(`p:${slogans.default}`);
      expect(t[5]).toBeNull();
      expect(JSON.stringify(t)).not.toContain("Tajný");
      expect(JSON.stringify(t)).not.toContain("Jana");
    });
  }
  it("skrytý (hidden_at) → předvolba a bez jména, i když je schválený", () => {
    const t = shapeTileItem(row({ hidden_at: new Date() }), shapeOpts);
    expect(JSON.stringify(t)).not.toContain("Tajný");
    expect(t[5]).toBeNull();
  });
  it("předvolba se ukáže; neznámá předvolba → výchozí", () => {
    expect(publicSlogan(row({ slogan_custom: null, slogan_status: "none", slogan_preset_id: "media-nedame" }), shapeOpts)).toBe("p:media-nedame");
    expect(publicSlogan(row({ slogan_custom: null, slogan_status: "none", slogan_preset_id: "smazana" }), shapeOpts)).toBe(`p:${slogans.default}`);
    expect(publicName(row({ first_name: null, name_status: "none" }))).toBeNull();
  });
  it("nextStatus: bez AI approved, s AI pending + fronta, nezměněný text drží stav (i rejected)", () => {
    expect(nextStatus("Ahoj", null, "none", false)).toEqual({ status: "approved", moderate: false });
    expect(nextStatus("Ahoj", null, "none", true)).toEqual({ status: "pending", moderate: true });
    expect(nextStatus("Ahoj", "Ahoj", "rejected", false)).toEqual({ status: "rejected", moderate: false });
    expect(nextStatus("Nový", "Ahoj", "rejected", false)).toEqual({ status: "approved", moderate: false });
    expect(nextStatus(null, "Ahoj", "approved", true)).toEqual({ status: "none", moderate: false });
  });
});

describe("obsah: content/demonstrace/slogans.yaml", () => {
  it("předvolby a vlastní seedové slogany projdou skriptovou moderací", () => {
    for (const p of slogans.presets) expect(scriptCheck(p.text, "slogan"), p.text).toMatchObject({ ok: true });
    for (const s of slogans.custom_seed_examples) expect(scriptCheck(s, "slogan"), s).toMatchObject({ ok: true });
  });
});

describe("seed generátor a statický export", () => {
  it("deterministický, všechny pózy a barvy, ids unikátní", () => {
    const a = generateDemoSeed(500, slogans);
    expect(generateDemoSeed(500, slogans)).toEqual(a);
    expect(new Set(a.map((s) => s.pose))).toEqual(new Set(POSES));
    expect(new Set(a.map((s) => s.signColor))).toEqual(new Set(SIGN_COLORS));
    expect(new Set(a.map((s) => s.id)).size).toBe(500);
    expect(a.some((s) => s.sloganCustom)).toBe(true);
    expect(a.some((s) => s.firstName)).toBe(true);
    expect(a.every((s) => s.seed >= 0 && s.seed <= 0xffffffff)).toBe(true);
    // Prvních 500 z velkého seedu = výchozí seed (statický export sedí s DB).
    expect(generateDemoSeed(600, slogans).slice(0, 500)).toEqual(a);
  });
  it("export: dlaždice + meta", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "demo-export-"));
    const items = generateDemoSeed(1500, slogans);
    expect(writeStaticExport(items, slogans, dir).tiles).toBe(2);
    const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8"));
    expect(meta).toEqual({ count: 1500, tiles: 2, tileSize: TILE_SIZE, demo: true });
    const t1 = JSON.parse(readFileSync(path.join(dir, "1.json"), "utf8")) as { n: number; items: TileItem[] };
    expect(t1.items).toHaveLength(500);
    expect(t1.items[0]![0]).toBe(1000);
  });
});

// ---------- DB ----------

let srv: DevDbServer;
let sql: postgres.Sql;
const prevEnv = { ...process.env };

beforeAll(async () => {
  srv = await startPgliteServer({ port: 0 });
  sql = createSql(srv.url, { max: 1 });
  await runMigrations(sql);
});
afterAll(async () => {
  process.env = { ...prevEnv };
  await sql?.end({ timeout: 1 }).catch(() => {});
  await srv?.stop().catch(() => {});
});

let n = 0;
const signData = (): SignData => ({
  name: "Jana Nováková",
  email: `demo.${n++}@seznam.cz`,
  showName: false,
  address: null,
  answers: { q1: 8.5, q2: "q2-opt1" },
  contentVersion: CONTENT_VERSION,
  region: null,
  ageGroup: null,
  municipalitySize: null,
  comment: null,
});

async function verifiedSignature(): Promise<string> {
  const r = await createOrReplaceSignature(sql, signData(), { poc: false });
  await verifySignature(sql, r.verifyToken);
  return r.signatureId;
}

const write = (over: Partial<DemoWrite> = {}): DemoWrite => ({
  sloganPresetId: "ruce-pryc",
  sloganCustom: null,
  pose: "mava",
  signColor: "white",
  seed: 4294967295,
  rerollCount: 2,
  firstName: null,
  ...over,
});
const noAi = { ai: false, poc: false };

describe("připojení a úprava v DB", () => {
  it("neověřený podpis se připojit nemůže; ověřený jednou, druhý pokus = exists", async () => {
    const r = await createOrReplaceSignature(sql, signData(), { poc: false });
    expect(await joinDemonstration(sql, r.signatureId, write(), noAi)).toEqual({ status: "not_eligible" });
    await verifySignature(sql, r.verifyToken);
    const j = await joinDemonstration(sql, r.signatureId, write(), noAi);
    expect(j.status).toBe("ok");
    const again = await joinDemonstration(sql, r.signatureId, write(), noAi);
    expect(again).toMatchObject({ status: "exists", id: (j as { id: string }).id });
    expect(await findBySignature(sql, r.signatureId)).toEqual({ id: (j as { id: string }).id, index: (j as { index: number }).index });
  });

  it("bez AI: vlastní text a jméno rovnou approved; seed 2^32−1 se uloží", async () => {
    const sig = await verifiedSignature();
    const j = await joinDemonstration(sql, sig, write({ sloganPresetId: null, sloganCustom: "Za kvalitní zprávy", firstName: "Petra" }), noAi);
    if (j.status !== "ok") throw new Error(j.status);
    expect(j.pending).toEqual([]);
    const [row] = await sql`select slogan_status, name_status, seed::text as seed, slogan_preset_id from app.demonstrator where id = ${j.id}`;
    expect(row).toMatchObject({ slogan_status: "approved", name_status: "approved", seed: "4294967295", slogan_preset_id: null });
  });

  it("s AI: pending + úloha ve stejné transakci; dlaždice ukazuje předvolbu; chyba enqueue = nic se nezapíše", async () => {
    const enqueue: Enqueue = async (tx, id, field, text) =>
      tx`insert into app.moderation_job (demonstrator_id, field, text_hash) values (${id}, ${field}, ${sha256Hex(text)})`;
    const sig = await verifiedSignature();
    const j = await joinDemonstration(sql, sig, write({ sloganPresetId: null, sloganCustom: "Čekám na kontrolu", firstName: "Eva" }), { ai: true, enqueue, poc: false });
    if (j.status !== "ok") throw new Error(j.status);
    expect(j.pending).toEqual(["slogan", "name"]);
    const jobs = await sql`select field, text_hash from app.moderation_job where demonstrator_id = ${j.id} order by field`;
    expect(jobs.map((x) => x.field)).toEqual(["name", "slogan"]);
    expect(jobs.find((x) => x.field === "slogan")!.text_hash).toBe(sha256Hex("Čekám na kontrolu"));
    const items = (await queryTileRows(sql, Math.floor(j.index / TILE_SIZE), true)).map((r) => shapeTileItem(r, shapeOpts));
    const mine = items.find((i) => i[6] === j.id)!;
    expect(mine[4]).toBe(`p:${slogans.default}`);
    expect(mine[5]).toBeNull();
    expect(await queryOwn(sql, j.id, sig)).toMatchObject({ sloganCustom: "Čekám na kontrolu", sloganStatus: "pending", nameStatus: "pending" });
    expect(await queryOwn(sql, j.id, "00000000-0000-4000-8000-000000000000")).toBeNull();

    const sig2 = await verifiedSignature();
    const failing: Enqueue = async () => {
      throw new Error("fronta nedostupná");
    };
    await expect(joinDemonstration(sql, sig2, write({ sloganPresetId: null, sloganCustom: "Nic" }), { ai: true, enqueue: failing, poc: false })).rejects.toThrow();
    expect(await findBySignature(sql, sig2)).toBeNull();
  });

  it("úprava: místo zůstává, cizí podpis nic nezmění, nezměněný zamítnutý text zůstane zamítnutý", async () => {
    const sig = await verifiedSignature();
    const j = await joinDemonstration(sql, sig, write({ sloganPresetId: null, sloganCustom: "Původní text" }), noAi);
    if (j.status !== "ok") throw new Error(j.status);
    const other = await verifiedSignature();
    expect(await editDemonstrator(sql, j.id, other, write(), noAi)).toEqual({ status: "not_found" });
    await moderateDemonstrator(sql, j.id, "ban-text");
    const e1 = await editDemonstrator(sql, j.id, sig, write({ sloganPresetId: null, sloganCustom: "Původní text", pose: "skace" }), noAi);
    expect(e1).toMatchObject({ status: "ok", index: j.index });
    let [row] = await sql`select slogan_status, pose, position_index from app.demonstrator where id = ${j.id}`;
    expect(row).toMatchObject({ slogan_status: "rejected", pose: "skace", position_index: j.index });
    await editDemonstrator(sql, j.id, sig, write({ sloganPresetId: null, sloganCustom: "Jiný text" }), noAi);
    [row] = await sql`select slogan_status, position_index from app.demonstrator where id = ${j.id}`;
    expect(row).toMatchObject({ slogan_status: "approved", position_index: j.index });
    const log = await sql`select action, actor from app.moderation_log where demonstrator_id = ${j.id}`;
    expect(log).toEqual([{ action: "ban-text", actor: "cli" }]);
  });

  it("pořadí ze sekvence: unikátní, rostoucí, po odvolání se index nepřidělí znovu", async () => {
    const ids: number[] = [];
    let withdrawnToken = "";
    let withdrawnSig = "";
    for (let i = 0; i < 4; i++) {
      const d = signData();
      const r = await createOrReplaceSignature(sql, d, { poc: false });
      await verifySignature(sql, r.verifyToken);
      const j = await joinDemonstration(sql, r.signatureId, write(), noAi);
      if (j.status !== "ok") throw new Error(j.status);
      ids.push(j.index);
      if (i === 1) {
        withdrawnSig = r.signatureId;
        withdrawnToken = (await requestEditLink(sql, d.email, { poc: false }))!.editToken;
      }
    }
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(new Set(ids).size).toBe(4);
    expect(await signatureFromEditToken(sql, withdrawnToken)).toBe(withdrawnSig);
    const w = await withdrawSignature(sql, withdrawnToken);
    expect(w).toMatchObject({ status: "ok", demonstrator: { index: ids[1] } });
    expect(await findBySignature(sql, withdrawnSig)).toBeNull();
    const [gone] = await sql`select count(*)::int as n from app.demonstrator where position_index = ${ids[1]!}`;
    expect(gone!.n).toBe(0);
    const next = await joinDemonstration(sql, await verifiedSignature(), write(), noAi);
    expect((next as { index: number }).index).toBeGreaterThan(ids[3]!);
  });
});

describe("nahlášení (§4.3)", () => {
  it("1 na IP; po 3 různých IP skryto + log (reports); unhide vynuluje", async () => {
    const sig = await verifiedSignature();
    const j = await joinDemonstration(sql, sig, write({ sloganPresetId: null, sloganCustom: "Sporný text", firstName: "Karel" }), noAi);
    if (j.status !== "ok") throw new Error(j.status);
    expect(await reportDemonstrator(sql, j.id, "ip-a")).toMatchObject({ status: "ok", hidden: false });
    expect(await reportDemonstrator(sql, j.id, "ip-a")).toMatchObject({ status: "duplicate" });
    expect(await reportDemonstrator(sql, j.id, "ip-b")).toMatchObject({ status: "ok", hidden: false });
    expect(await reportDemonstrator(sql, j.id, "ip-c")).toMatchObject({ status: "ok", hidden: true, newlyHidden: true });
    expect(await reportDemonstrator(sql, j.id, "ip-d")).toMatchObject({ status: "ok", hidden: true, newlyHidden: false });
    expect(await reportDemonstrator(sql, "00000000-0000-4000-8000-000000000000", "ip-a")).toEqual({ status: "not_found" });

    const tile = (await queryTileRows(sql, Math.floor(j.index / TILE_SIZE), true)).map((r) => shapeTileItem(r, shapeOpts));
    expect(JSON.stringify(tile)).not.toContain("Sporný");
    expect(JSON.stringify(tile)).not.toContain("Karel");
    expect(await sql`select action, actor from app.moderation_log where demonstrator_id = ${j.id}`).toEqual([{ action: "hide", actor: "reports" }]);
    expect((await listReported(sql)).find((r) => r.id === j.id)).toMatchObject({ hidden: true, reportCount: 4 });

    await moderateDemonstrator(sql, j.id, "unhide");
    const [row] = await sql`select hidden_at, report_count from app.demonstrator where id = ${j.id}`;
    expect(row).toMatchObject({ hidden_at: null, report_count: 0 });
    const tile2 = (await queryTileRows(sql, Math.floor(j.index / TILE_SIZE), true)).map((r) => shapeTileItem(r, shapeOpts));
    expect(JSON.stringify(tile2)).toContain("Sporný");
    expect(await moderateDemonstrator(sql, "00000000-0000-4000-8000-000000000000", "hide")).toBeNull();
  });
});

describe("rate limit připojení", () => {
  it("10/h na podpis, 20/h na IP", async () => {
    const now = new Date("2026-10-28T10:00:00Z");
    for (let i = 1; i <= 10; i++) expect((await hit(sql, "demoWritePerSignature", "sig-x", now)).allowed).toBe(true);
    expect((await hit(sql, "demoWritePerSignature", "sig-x", now)).allowed).toBe(false);
    for (let i = 1; i <= 20; i++) expect((await hit(sql, "demoWritePerIp", "ip-x", now)).allowed).toBe(true);
    expect((await hit(sql, "demoWritePerIp", "ip-x", now)).allowed).toBe(false);
  });
});

describe("seed v DB", () => {
  it("seed zapíše účastníky na seedové podpisy, meta bez seedu je nezapočítá, clear vrátí sekvenci na 0", async () => {
    const fresh = await startPgliteServer({ port: 0 });
    const s2 = createSql(fresh.url, { max: 1 });
    try {
      await runMigrations(s2);
      const [sigRow] = await s2<{ id: string }[]>`
        insert into app.signature (answers, content_version, verification_level, is_seed) values ('{}'::jsonb, 'x', 'email', true) returning id`;
      expect(sigRow).toBeTruthy();
      const items = generateDemoSeed(1200, slogans);
      const r = await insertDemoSeed(s2, items);
      expect(r).toEqual({ inserted: 1200, extraSignatures: 1199 });
      expect(await queryMeta(s2, true)).toEqual({ count: 1200, tiles: 2, tileSize: TILE_SIZE });
      expect(await queryMeta(s2, false)).toEqual({ count: 0, tiles: 0, tileSize: TILE_SIZE });
      const t0 = await queryTileRows(s2, 0, true);
      expect(t0.map((x) => x.position_index)).toEqual(Array.from({ length: 1000 }, (_, i) => i));
      expect(t0[0]!.id).toBe(items[0]!.id);
      expect(await clearDemoSeed(s2)).toBe(1200);
      const [nextIdx] = await s2<{ v: string }[]>`select nextval('app.demonstrator_position_seq')::text as v`;
      expect(nextIdx!.v).toBe("0");
    } finally {
      await s2.end({ timeout: 1 }).catch(() => {});
      await fresh.stop().catch(() => {});
    }
  });
});
