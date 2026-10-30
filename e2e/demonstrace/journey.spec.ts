/**
 * SPEC-demonstrace §11 E2E (mobil 360 i desktop 1280): podpis → POC ověření (cookie vlastníka)
 * → /demonstrace/pripojit (předvolba, póza, barva, „Jiný panáček“, křestní jméno, souhlas)
 * → /demonstrace/[id] s kartou → osobní stránka „Můj panáček v davu“ → úprava sloganu na vlastní
 * text (skriptová moderace odmítne „k.r.e.t.e.n“) → nahlášení ze 3 IP skryje text i jméno v dlaždici.
 * Předpoklady: POC_MODE=1, testovací Turnstile, bez MODERATION_API_KEY (texty se schvalují skriptem).
 */
import { expect, test, type Page } from "@playwright/test";
import { answerCompass, esc, JOURNEY, randomIp, stance, ui } from "../acceptance/helpers";
import { ct, demoSlogans, dt, expectOwnerCookie, external, MODERATION_MESSAGE, presetText, report, tileItem, uniqueEmail, uniqueText } from "./helpers";

const j = dt.join;

/** Krok průvodce: nadpis kroku (h1/legend) musí být vidět. */
async function expectStep(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title }).or(page.getByText(title, { exact: true })).first()).toBeVisible();
}

/** Volba v průvodci; klepnutí před hydratací Reactu nic neudělá (produkce, pomalejší síť), proto opakovat. */
async function pick(page: Page, name: string, exact = true) {
  const radio = page.getByRole("radio", { name, exact });
  await expect(async () => {
    if ((await radio.getAttribute("aria-checked")) !== "true") await radio.click({ timeout: 2_000 });
    await expect(radio).toHaveAttribute("aria-checked", "true", { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

async function next(page: Page) {
  await page.getByRole("button", { name: j.next_button, exact: true }).click();
}

test("§11: podpis → připojení → karta → úprava sloganu → moderace → nahlášení", async ({ page, request }, testInfo) => {
  test.setTimeout(300_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  const firstName = testInfo.project.name.startsWith("mobile") ? "Jana" : "Petra";

  let uuid = "";
  await test.step("podpis kompasu a POC ověření nastaví cookie vlastníka", async () => {
    await page.goto("/kompas");
    await answerCompass(page, JOURNEY);
    await page.getByRole("link", { name: ui.compass.sign_button }).click();
    await expect(page).toHaveURL(/\/kompas\/podpis/, { timeout: 30_000 });
    await page.getByLabel(/jméno/i).first().fill("Demo Akceptační");
    await page.getByLabel(/e-mail/i).first().fill(uniqueEmail(testInfo.project.name));
    await page.getByRole("checkbox", { name: /souhlas/i }).first().check();
    await expect(page.locator('input[name="cf-turnstile-response"]').first()).toHaveValue(/.+/, { timeout: 60_000 });
    await page.getByRole("button", { name: /podepsat|podepiš|odeslat/i }).last().click();
    const link = page.locator('main a[href*="/overeni/"]').first();
    await expect(link).toBeVisible({ timeout: 30_000 });
    expect((await page.context().cookies()).some((c) => c.name === "ok_owner")).toBe(false);
    await link.click();
    await page.waitForURL(/\/v\/[0-9a-f-]{36}/, { timeout: 30_000 });
    uuid = /\/v\/([0-9a-f-]{36})/.exec(page.url())![1]!;
    await expectOwnerCookie(page);
  });

  await test.step("osobní stránka zve do davu", async () => {
    const invite = page.locator("section", { has: page.getByRole("heading", { name: dt.page_title }) });
    await expect(invite).toBeVisible();
    await invite.getByRole("link", { name: dt.page_join_button }).click();
    await expect(page).toHaveURL(/\/demonstrace\/pripojit/);
  });

  await test.step("průvodce připojením (§3)", async () => {
    await expectStep(page, j.slogan_title);
    await pick(page, presetText("media-nedame"));
    await next(page);

    await expectStep(page, j.pose_title);
    await pick(page, j.poses.mava);
    await next(page);

    await expectStep(page, j.color_title);
    await pick(page, j.colors.blue, false);
    await next(page);

    await expectStep(page, j.look_title);
    await expect(page.getByText(j.reroll_left.replace("{n}", "20"))).toBeVisible();
    await page.getByRole("button", { name: j.reroll_button }).click();
    await expect(page.getByText(j.reroll_left.replace("{n}", "19"))).toBeVisible();
    await next(page);

    await expectStep(page, j.name_title);
    // Výchozí volba je „Připojit se anonymně“ (§3.5).
    await expect(page.getByRole("radio", { name: j.name_anonymous })).toHaveAttribute("aria-checked", "true");
    await pick(page, j.name_show, false);
    await page.getByLabel(j.name_label).fill(firstName);
    await next(page);

    await expectStep(page, j.consent_title);
    await expect(page.getByText(`„${presetText("media-nedame")}“`)).toBeVisible();
    await expect(page.locator("dd", { hasText: firstName })).toBeVisible();
    // Bez souhlasu to nejde (§3.6).
    await page.getByRole("button", { name: j.submit_button, exact: true }).click();
    await expect(page.getByText(j.consent_error).first()).toBeVisible();
    await page.getByRole("checkbox", { name: j.consent_label }).check();
    await page.getByRole("button", { name: j.submit_button, exact: true }).click();
    await page.waitForURL(/\/demonstrace\/[0-9a-f-]{36}/, { timeout: 30_000 });
  });

  const id = /\/demonstrace\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  let index = -1;

  await test.step("/demonstrace/[id] ukáže kartu panáčka", async () => {
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole("heading", { name: firstName })).toBeVisible();
    await expect(card.getByText(`„${presetText("media-nedame")}“`)).toBeVisible();
    const rankRe = new RegExp(`^${esc(ct.card.rank).replace(esc("{rank}"), "\\d[\\d\\s\\u00a0]*")}$`);
    await expect(card.getByText(rankRe)).toBeVisible();
    await expect(card.getByRole("button", { name: ct.card.share_button })).toBeVisible();
    await expect(card.getByRole("button", { name: ct.card.report_button })).toBeVisible();
    const person = (await (await page.request.get(`/api/demonstrace/${id}`)).json()) as { index: number; pose: string; signColor: string; name: string | null };
    index = person.index;
    expect(person).toMatchObject({ pose: "mava", signColor: "blue", name: firstName });
    // Dav: kanvas a počet účastníků.
    await expect(page.getByRole("application", { name: ct.canvas_label })).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  await test.step("osobní stránka: „Můj panáček v davu“", async () => {
    await page.goto(`/v/${uuid}`);
    const mine = page.getByRole("link", { name: dt.page_mine_label });
    await expect(mine).toBeVisible();
    await expect(mine).toHaveAttribute("href", `/demonstrace/${id}`);
    await page.getByRole("link", { name: dt.page_edit_button }).click();
    await expect(page).toHaveURL(/\/demonstrace\/pripojit/);
  });

  const custom = uniqueText("Jsem tu");
  await test.step("úprava: vlastní slogan, moderace odmítne „k.r.e.t.e.n“", async () => {
    await expect(page.getByText(j.edit_kicker).first()).toBeVisible();
    await pick(page, j.slogan_custom_option, false);
    const input = page.getByLabel(j.slogan_custom_label);
    await input.fill("k.r.e.t.e.n");
    await expect(page.getByText(MODERATION_MESSAGE).first()).toBeVisible();
    await next(page);
    await expectStep(page, j.slogan_title); // s odmítnutým textem dál nepustí

    // Server odmítá stejně (stejná funkce, §4.1) a hlášku nevysvětluje.
    const api = await page.request.patch(`/api/demonstrace/${id}`, {
      data: { sloganCustom: "k.r.e.t.e.n", pose: "mava", signColor: "blue", seed: 1, rerollCount: 1, firstName, consent: true },
    });
    expect(api.status()).toBe(400);
    expect(await api.json()).toMatchObject({ error: "moderation", message: MODERATION_MESSAGE });

    await input.fill(custom);
    await expect(page.getByText(MODERATION_MESSAGE)).toHaveCount(0);
    // Náhled ukazuje nový text, ne předchozí ceduli (úklid animace dřív vracel staré SVG).
    const signText = page.locator("div.sticky svg text");
    await expect.poll(async () => (await signText.textContent())?.replace(/\s+/g, "")).toBe(custom.replace(/\s+/g, ""));
    // Volná navigace krokem 6 (Souhlas); souhlas se u úpravy dává znovu.
    await page.getByRole("button", { name: new RegExp(esc(j.step_consent)) }).click();
    await expectStep(page, j.consent_title);
    await page.getByRole("checkbox", { name: j.consent_label }).check();
    await page.getByRole("button", { name: j.save_button, exact: true }).click();
    await page.waitForURL(new RegExp(`/demonstrace/${id}`), { timeout: 30_000 });
    const card = page.getByRole("dialog");
    await expect(card.getByText(`„${custom}“`)).toBeVisible({ timeout: 30_000 });
  });

  await test.step("dlaždice obsahuje schválený vlastní text a jméno", async () => {
    await expect.poll(async () => (await tileItem(request, id, index))?.[4], { timeout: 60_000 }).toBe(`t:${custom}`);
    expect((await tileItem(request, id, index))?.[5]).toBe(firstName);
  });

  await test.step("nahlášení: tlačítko v kartě + 2 další IP → skrytí (§4.3)", async () => {
    const card = page.getByRole("dialog");
    await card.getByRole("button", { name: ct.card.report_button }).click();
    // IN-FLIGHT: nahlášení s Turnstile (widget v kartě). Pokud widget je, počkej na token a potvrď;
    // na commitu 03d2435 widget není a nahlášení se odešle hned.
    const turnstile = card.locator('input[name="cf-turnstile-response"]');
    await expect(async () => {
      if (await card.getByText(ct.card.reported).isVisible()) return;
      if (await turnstile.count()) {
        await expect(turnstile.first()).toHaveValue(/.+/, { timeout: 2_000 });
        const again = card.getByRole("button", { name: ct.card.report_button });
        if (await again.isVisible()) await again.click({ timeout: 2_000 });
      }
      await expect(card.getByText(ct.card.reported)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    if (external) {
      // Na Vercelu IP klienta určuje platforma (X-Forwarded-For nejde podvrhnout) – 3 různé IP nesimulujeme.
      testInfo.annotations.push({ type: "skip-part", description: "skrytí po 3 IP jen lokálně" });
      return;
    }
    await report(request, id, randomIp());
    await report(request, id, randomIp());
    await expect.poll(async () => (await tileItem(request, id, index))?.[4], { timeout: 30_000 }).toBe(`p:${demoSlogans.default}`);
    expect((await tileItem(request, id, index))?.[5]).toBeNull();
    // Veřejná karta (bez cookie) taky bez textu a jména.
    const pub = (await (await request.get(`/api/demonstrace/${id}`)).json()) as { slogan: string; name: string | null };
    expect(pub.name).toBeNull();
    expect(pub.slogan).toBe(`p:${demoSlogans.default}`);
    // Seznam ani dav text neukazují.
    await page.goto(`/demonstrace/seznam?strana=${Math.floor(index / 50) + 1}`);
    await expect(page.locator(`a[href="/demonstrace/${id}"]`)).toContainText(dt.list.anonymous);
    await expect(page.getByText(custom)).toHaveCount(0);
  });

  await test.step("blok „Kde stojíme my“ má třetí tlačítko", async () => {
    await page.goto("/");
    const block = page.getByRole("region", { name: ui.stance.region_aria }).or(page.locator("section", { hasText: stance.title })).first();
    await expect(block.getByRole("link", { name: dt.stance_join_label })).toHaveAttribute("href", "/demonstrace/pripojit");
  });
});
