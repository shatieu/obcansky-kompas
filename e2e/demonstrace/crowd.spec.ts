/**
 * SPEC-demonstrace §2, §4, §6.4, §11: seznam účastníků, blok „Kde stojíme my“ (třetí tlačítko
 * + živý počet), brána připojení bez podpisu, stránka davu a API dlaždic (nikdy neschválené
 * ani skryté texty). Data vznikají přes API (podpis + POC ověření + připojení).
 */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { randomIp, stance, ui } from "../acceptance/helpers";
import { allTileItems, apiJoin, ct, demoSlogans, dt, e2eCronSecret, external, report, signAndVerify, tileItem, uniqueText } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

test("§2: /demonstrace/seznam vypíše účastníka se jménem a sloganem", async ({ page }) => {
  await signAndVerify(page);
  const slogan = uniqueText("Jsem tu");
  const { id, index } = await apiJoin(page, { sloganCustom: slogan, firstName: "Seznam", pose: "skace", signColor: "red" });
  // Druhá žádost o připojení stejného podpisu = 409 s id (jeden panáček na podpis, §3).
  const again = await page.request.post("/api/demonstrace/join", {
    data: { sloganPresetId: demoSlogans.presets[0]!.id, pose: "drzi", signColor: "white", seed: 1, rerollCount: 0, firstName: null, consent: true },
  });
  expect(again.status()).toBe(409);
  expect(await again.json()).toMatchObject({ id, index });

  await page.goto("/demonstrace/seznam");
  await expect(page.getByRole("heading", { name: dt.list.title })).toBeVisible();
  await expect(page.locator('ol a[href^="/demonstrace/"]').first()).toBeVisible();
  await page.goto(`/demonstrace/seznam?strana=${Math.floor(index / 50) + 1}`);
  const row = page.locator(`a[href="/demonstrace/${id}"]`);
  await expect(row).toContainText("Seznam");
  await expect(row).toContainText(`„${slogan}“`);
  // Pořadí „N.“ (tisíce oddělené mezerou).
  await expect(row).toContainText(new RegExp(`(^|\\D)${String(index + 1).replace(/\B(?=(\d{3})+(?!\d))/g, "[\\s\\u00a0]?")}\\.`));
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/demonstrace/${id}`));
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Seznam" })).toBeVisible({ timeout: 30_000 });
});

test("§2: blok „Kde stojíme my“ má třetí tlačítko a živý počet", async ({ page, request }) => {
  const meta = (await (await request.get(`/api/demonstrace/meta${external ? `?e2e=${Date.now()}` : ""}`)).json()) as { count: number };
  await page.goto("/");
  const block = page.getByRole("region", { name: ui.stance.region_aria }).or(page.locator("section", { hasText: stance.title })).first();
  await expect(block.getByRole("link", { name: dt.stance_join_label })).toHaveAttribute("href", "/demonstrace/pripojit");
  const countLink = block.locator('a[href="/demonstrace"]');
  // Řádek s počtem: „N lidí už stojí v davu“ (nebo „Dav na tebe čeká“ u prázdného davu).
  await expect(countLink).toHaveText(meta.count > 0 ? /\d[\d\s ]*\s.*v davu/ : new RegExp(dt.stance_count_zero), { timeout: 15_000 });
  if (meta.count > 0) {
    const shown = Number((await countLink.innerText()).replace(/[^\d]/g, ""));
    // Počet je z CDN cache (30 s) – mezitím mohli přibýt další.
    expect(shown).toBeGreaterThanOrEqual(1);
    expect(shown).toBeLessThanOrEqual(meta.count + 50);
  }
  await countLink.click();
  await expect(page).toHaveURL(/\/demonstrace$/);
});

test("§2: bez ověřeného podpisu připojení vede do kompasu", async ({ page }) => {
  await page.goto("/demonstrace/pripojit");
  await expect(page.getByRole("heading", { name: dt.join.gate_title })).toBeVisible();
  await expect(page.getByRole("link", { name: dt.join.gate_button })).toHaveAttribute("href", "/kompas");
  const res = await page.request.post("/api/demonstrace/join", {
    data: { sloganPresetId: demoSlogans.presets[0]!.id, pose: "drzi", signColor: "white", seed: 1, rerollCount: 0, firstName: null, consent: true },
  });
  expect(res.status()).toBe(401);
});

test("§6: stránka davu – počet, ovládání, kanvas", async ({ page }) => {
  await page.goto("/demonstrace");
  await expect(page.getByRole("application", { name: ct.canvas_label })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(ct.loading)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText(ct.error)).toHaveCount(0);
  // Viditelný počet „N účastníků“ (popis kanvasu pro čtečky má stejné číslo na konci odstavce – ten je skrytý).
  await expect(page.getByText(/^\d[\d\s ]*\s+účastník(ů|ci)?$/).first()).toBeVisible({ timeout: 15_000 });
  for (const name of [ct.start_button, ct.end_button]) await expect(page.getByRole("button", { name })).toBeVisible();
  await expect(page.getByRole("link", { name: ct.join_button })).toHaveAttribute("href", "/demonstrace/pripojit");
  await expect(page.getByRole("link", { name: ct.list_button })).toHaveAttribute("href", "/demonstrace/seznam");
  // Ovládání klávesnicí zapíše kameru do URL (?x=&y=&z=, §6.2).
  await page.getByRole("application", { name: ct.canvas_label }).focus();
  await page.keyboard.press("+");
  await expect.poll(() => new URL(page.url()).searchParams.get("z"), { timeout: 10_000 }).not.toBeNull();
});

test("§4/§6.4: dlaždice nikdy neobsahují skryté ani zamítnuté texty a jména", async ({ page, request }) => {
  test.skip(external, "nahlášení ze 3 IP a CLI demo:ban-text jen proti lokálnímu e2e serveru");
  test.setTimeout(120_000);

  // A) skrytý po 3 nahlášeních z různých IP
  await signAndVerify(page);
  const hiddenText = uniqueText("Skryto");
  const a = await apiJoin(page, { sloganCustom: hiddenText, firstName: "Skryta" });
  await expect.poll(async () => (await tileItem(request, a.id, a.index))?.[4]).toBe(`t:${hiddenText}`);
  // Jedna IP se počítá jen jednou (max. 1 nahlášení na IP a panáčka).
  const ip = randomIp();
  await report(request, a.id, ip);
  await report(request, a.id, ip);
  await report(request, a.id, randomIp());
  expect((await tileItem(request, a.id, a.index))?.[4]).toBe(`t:${hiddenText}`);
  await report(request, a.id, randomIp());
  await expect.poll(async () => (await tileItem(request, a.id, a.index))?.[4]).toBe(`p:${demoSlogans.default}`);

  // B) zamítnutý vlastní text (pnpm demo:ban-text <id>, trvalé odmítnutí; actor cli)
  await page.context().clearCookies();
  await signAndVerify(page, "Druhy Tester");
  const bannedText = uniqueText("Zakazano");
  const b = await apiJoin(page, { sloganCustom: bannedText, firstName: "Zakaz" });
  await expect.poll(async () => (await tileItem(request, b.id, b.index))?.[4]).toBe(`t:${bannedText}`);
  const base = test.info().project.use.baseURL!;
  const pgPort = process.env.E2E_PGLITE_PORT ?? "54456";
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/demo-ban-text.ts", b.id], {
    env: { ...process.env, PGLITE_PORT: pgPort, DATABASE_URL: "", NEXT_PUBLIC_SITE_URL: base, CRON_SECRET: e2eCronSecret },
    stdio: "pipe",
    timeout: 60_000,
  });
  await expect.poll(async () => (await tileItem(request, b.id, b.index))?.[4], { timeout: 30_000 }).toBe(`p:${demoSlogans.default}`);
  // Jméno se zamítnutím sloganu nemění – trvale se odmítá jen vlastní text.
  // Úprava se stejným textem stav „rejected“ drží (nezmění se na schválený).
  const keep = await page.request.patch(`/api/demonstrace/${b.id}`, {
    headers: { "x-forwarded-for": randomIp() },
    data: { sloganCustom: bannedText, pose: "drzi", signColor: "white", seed: 1, rerollCount: 0, firstName: "Zakaz", consent: true },
  });
  expect(keep.status(), await keep.text()).toBe(200);
  expect((await tileItem(request, b.id, b.index))?.[4]).toBe(`p:${demoSlogans.default}`);
  // Vlastník svůj text vidí se stavem „rejected“, veřejnost ne.
  const own = (await (await page.request.get(`/api/demonstrace/${b.id}`)).json()) as { own?: { sloganCustom: string; sloganStatus: string } };
  expect(own.own).toMatchObject({ sloganCustom: bannedText, sloganStatus: "rejected" });

  // C) celý dav: žádná položka nenese skrytý/zamítnutý text ani jméno skrytého
  const items = await allTileItems(request);
  expect(items.length).toBeGreaterThan(0);
  for (const it of items) {
    expect(it[4]).not.toBe(`t:${hiddenText}`);
    expect(it[4]).not.toBe(`t:${bannedText}`);
    expect(it[4]).toMatch(/^(p:[a-z0-9-]+|t:.+)$/);
  }
  expect(items.find((it) => it[6] === a.id)?.[5]).toBeNull();
  // Seznam (server, z dlaždic) je taky neukazuje.
  await page.goto(`/demonstrace/seznam?strana=${Math.floor(a.index / 50) + 1}`);
  await expect(page.getByText(hiddenText)).toHaveCount(0);
  await page.goto(`/demonstrace/seznam?strana=${Math.floor(b.index / 50) + 1}`);
  await expect(page.getByText(bannedText)).toHaveCount(0);
});
