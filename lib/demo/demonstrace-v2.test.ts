import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { CONTENT_VERSION } from "@/lib/content";
import { createSql } from "@/lib/db/client";
import { startPgliteServer, type DevDbServer } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { createOrReplaceSignature, verifySignature, type SignData } from "@/lib/sign/service";
import { mulberry32 } from "@/lib/stickman/prng";
import { LAYOUT } from "@/lib/crowd/layout";
import { MAX_REROLLS, POSES, SIGN_COLORS } from "./constants";
import { GALLERY_SIZE, isGallerySeed, LOOK_GALLERY } from "./gallery";
import { IN_CROWD_COOKIE, inCrowdSetCookie } from "./in-crowd";
import { demoInputSchema } from "./input";
import { createDemonstrator, editDemonstrator, joinDemonstration, nextRerollCount, randomDemoWrite, type DemoWrite } from "./service";
import { generateDemoSeed, NO_SIGN_SHARE } from "./seed";
import { loadDemoSlogans } from "./slogans-schema";
import { publicSlogan, queryMeta } from "./tiles";

/**
 * Online demonstrace v2 (požadavky vlastníka 2026-10-28): panáček bez cedule, galerie vzhledů,
 * pravidlo změn vzhledu na serveru, náhodný panáček pro připojení při podpisu, meta s rozsahem
 * indexů, nápověda ok_in_crowd.
 */
const slogans = loadDemoSlogans();
const shapeOpts = { defaultPresetId: slogans.default, isPresetId: (id: string) => slogans.presets.some((p) => p.id === id) };
const base = { pose: "mava", seed: 1, rerollCount: 0, consent: true } as const;

describe("bez cedule: vstup a veřejný slogan", () => {
  it("s cedulí je slogan povinný, bez cedule ne; obojí najednou nikdy", () => {
    expect(demoInputSchema.safeParse({ ...base, signColor: "white" }).success).toBe(false);
    expect(demoInputSchema.safeParse({ ...base, signColor: "none" }).success).toBe(true);
    expect(demoInputSchema.safeParse({ ...base, signColor: "none", sloganPresetId: "ruce-pryc" }).success).toBe(true);
    expect(demoInputSchema.safeParse({ ...base, signColor: "none", sloganPresetId: "ruce-pryc", sloganCustom: "Text" }).success).toBe(false);
    expect(demoInputSchema.safeParse({ ...base, signColor: "zelena", sloganPresetId: "ruce-pryc" }).success).toBe(false);
  });

  it("délka sloganu se počítá v kódových bodech (40), ne v UTF-16", () => {
    const astral = "𝐀".repeat(40); // 40 kódových bodů, 80 UTF-16 jednotek
    expect(demoInputSchema.safeParse({ ...base, signColor: "white", sloganCustom: astral }).success).toBe(true);
    expect(demoInputSchema.safeParse({ ...base, signColor: "white", sloganCustom: astral + "𝐀" }).success).toBe(false);
  });

  it("panáček bez cedule a bez sloganu má veřejný slogan prázdný, s cedulí výchozí předvolbu", () => {
    const row = { slogan_preset_id: null, slogan_custom: null, slogan_status: "none" as const, hidden_at: null };
    expect(publicSlogan({ ...row, sign_color: "none" }, shapeOpts)).toBe("");
    expect(publicSlogan({ ...row, sign_color: "red" }, shapeOpts)).toBe(`p:${slogans.default}`);
    expect(publicSlogan({ ...row, slogan_preset_id: "ruce-pryc", sign_color: "none" }, shapeOpts)).toBe("p:ruce-pryc");
  });
});

describe("galerie a pravidlo změn vzhledu", () => {
  it("galerie: 24 různých deterministických seedů v rozsahu u32", () => {
    expect(LOOK_GALLERY).toHaveLength(GALLERY_SIZE);
    expect(new Set(LOOK_GALLERY).size).toBe(GALLERY_SIZE);
    for (const s of LOOK_GALLERY) expect(s >>> 0).toBe(s);
    expect(isGallerySeed(LOOK_GALLERY[5]!)).toBe(true);
    expect(isGallerySeed(12345)).toBe(false);
  });

  it("nezměněný seed drží uložený počet; galerie nespotřebuje; náhodná změna aspoň +1; nikdy níž; strop 20", () => {
    expect(nextRerollCount(7, 5, 7, 0)).toBe(5);
    expect(nextRerollCount(7, 5, LOOK_GALLERY[0]!, 0)).toBe(5);
    expect(nextRerollCount(7, 5, LOOK_GALLERY[0]!, 6)).toBe(6);
    expect(nextRerollCount(7, 5, 99, 0)).toBe(6);
    expect(nextRerollCount(7, 5, 99, 3)).toBe(6);
    expect(nextRerollCount(7, 5, 99, 8)).toBe(8);
    expect(nextRerollCount(7, 19, 99, 50)).toBe(MAX_REROLLS);
    expect(nextRerollCount(7, MAX_REROLLS, 99, MAX_REROLLS)).toBeNull();
    expect(nextRerollCount(7, MAX_REROLLS, LOOK_GALLERY[1]!, 0)).toBe(MAX_REROLLS);
  });
});

describe("náhodný panáček (připojení při podpisu)", () => {
  it("platné volby: všechny pózy i barvy včetně bez cedule, předvolba, bez jména a vlastního textu", () => {
    const rand = mulberry32(42);
    const ids = slogans.presets.map((p) => p.id);
    const poses = new Set<string>();
    const colors = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const w = randomDemoWrite(rand, ids, slogans.default);
      poses.add(w.pose);
      colors.add(w.signColor);
      expect(ids).toContain(w.sloganPresetId);
      expect(w.sloganCustom).toBeNull();
      expect(w.firstName).toBeNull();
      expect(w.seed >>> 0).toBe(w.seed);
      expect(demoInputSchema.safeParse({ ...w, consent: true, sloganCustom: undefined, firstName: undefined }).success).toBe(true);
    }
    expect(poses.size).toBe(POSES.length);
    expect(colors.size).toBe(SIGN_COLORS.length);
  });
});

describe("ukázkový dav: asi třetina bez cedule", () => {
  it("podíl bez cedule ~1/3, každá póza i bez cedule hned na začátku, bez cedule může chybět slogan", () => {
    const items = generateDemoSeed(500, slogans);
    const none = items.filter((d) => d.signColor === "none");
    expect(none.length / items.length).toBeGreaterThan(NO_SIGN_SHARE - 0.08);
    expect(none.length / items.length).toBeLessThan(NO_SIGN_SHARE + 0.08);
    expect(new Set(items.slice(0, POSES.length * 4).filter((d) => d.signColor === "none").map((d) => d.pose)).size).toBe(POSES.length);
    expect(none.some((d) => !d.sloganPresetId && !d.sloganCustom)).toBe(true);
    for (const d of items.filter((x) => x.signColor !== "none")) expect(Boolean(d.sloganPresetId) || Boolean(d.sloganCustom)).toBe(true);
  });
});

describe("rozestup davu (+15–20 %)", () => {
  it("spacingX a rowSpacing", () => {
    expect(LAYOUT.spacingX).toBeGreaterThanOrEqual(46);
    expect(LAYOUT.rowSpacing).toBeGreaterThanOrEqual(71);
  });
});

describe("nápověda ok_in_crowd", () => {
  it("Set-Cookie bez HttpOnly, nastavení a smazání", () => {
    const on = inCrowdSetCookie(true, true);
    expect(on.startsWith(`${IN_CROWD_COOKIE}=1;`)).toBe(true);
    expect(on).not.toMatch(/httponly/i);
    expect(on).toMatch(/Secure/);
    expect(inCrowdSetCookie(false, false)).toMatch(/Max-Age=0/);
  });
});

// ---------- DB ----------

let srv: DevDbServer;
let sql: postgres.Sql;

beforeAll(async () => {
  srv = await startPgliteServer({ port: 0 });
  sql = createSql(srv.url, { max: 1 });
  await runMigrations(sql);
});
afterAll(async () => {
  await sql?.end({ timeout: 1 }).catch(() => {});
  await srv?.stop().catch(() => {});
});

let k = 0;
const signData = (): SignData => ({
  name: "Jana Nováková",
  email: `demo.v2.${k++}@seznam.cz`,
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
  seed: 1000,
  rerollCount: 0,
  firstName: null,
  ...over,
});
const noAi = { ai: false, poc: false };

describe("DB: bez cedule, změny vzhledu, náhodný panáček, meta", () => {
  it("bez cedule a bez sloganu se uloží; s cedulí bez sloganu DB odmítne (check)", async () => {
    const sig = await verifiedSignature();
    const j = await joinDemonstration(sql, sig, write({ signColor: "none", sloganPresetId: null }), noAi);
    expect(j.status).toBe("ok");
    const sig2 = await verifiedSignature();
    await expect(joinDemonstration(sql, sig2, write({ signColor: "blue", sloganPresetId: null }), noAi)).rejects.toThrow();
  });

  it("úprava: náhodná změna zvýší počet aspoň o 1, galerie ne, nad 20 odmítnuto", async () => {
    const sig = await verifiedSignature();
    const j = await joinDemonstration(sql, sig, write({ rerollCount: 3 }), noAi);
    if (j.status !== "ok") throw new Error(j.status);
    const count = async () => (await sql`select reroll_count from app.demonstrator where id = ${j.id}`)[0]!.reroll_count as number;
    await editDemonstrator(sql, j.id, sig, write({ seed: 2000, rerollCount: 0 }), noAi);
    expect(await count()).toBe(4);
    await editDemonstrator(sql, j.id, sig, write({ seed: LOOK_GALLERY[3]!, rerollCount: 0 }), noAi);
    expect(await count()).toBe(4);
    await sql`update app.demonstrator set reroll_count = 20 where id = ${j.id}`;
    expect(await editDemonstrator(sql, j.id, sig, write({ seed: 3000, rerollCount: 20 }), noAi)).toEqual({ status: "reroll_limit" });
    expect((await editDemonstrator(sql, j.id, sig, write({ seed: LOOK_GALLERY[4]!, rerollCount: 0 }), noAi)).status).toBe("ok");
  });

  it("createDemonstrator s náhodnými výchozími volbami v transakci volajícího", async () => {
    const sig = await verifiedSignature();
    const r = await sql.begin((tx) => createDemonstrator(tx, sig, { ...noAi, random: { rand: mulberry32(7) } }));
    expect(r.pending).toEqual([]);
    const [row] = await sql`select pose, sign_color, slogan_preset_id, first_name from app.demonstrator where id = ${r.id}`;
    expect(row).toMatchObject({ pose: r.look.pose, sign_color: r.look.signColor, slogan_preset_id: slogans.default, first_name: null });
  });

  it("meta vrací minIndex a maxIndex (rozsah s mezerami), count = počet řádků", async () => {
    const m = await queryMeta(sql, true);
    const [agg] = await sql`select count(*)::int as n, min(position_index) as min, max(position_index) as max from app.demonstrator`;
    expect(m.count).toBe(agg!.n);
    expect(m.minIndex).toBe(Number(agg!.min));
    expect(m.maxIndex).toBe(Number(agg!.max));
  });
});
