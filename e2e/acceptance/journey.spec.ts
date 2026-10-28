/**
 * SPEC §15 milník 16 – celá cesta na mobilu (360×780) i desktopu (1280×800):
 * kompas → podpis → POC ověření (odkaz na obrazovce, „Ukázkový režim“) → osobní stránka
 * → srovnání → zákon → akce → fotka.
 * Předpoklady: server s POC_MODE=1 (pnpm dev to nastaví), Turnstile testovací klíče.
 */
import { expect, test } from "@playwright/test";
import { answerCompass, esc, JOURNEY, lawBase, letterLabel, makePng, randomIp, sentences, stance, ui } from "./helpers";

test("§15 m16: kompas → podpis → POC ověření → osobní stránka → srovnání → zákon → akce → fotka", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });

  await test.step("kompas", async () => {
    await page.goto("/kompas");
    await answerCompass(page, JOURNEY);
    await expect(page.getByText(sentences.intro.text).first()).toBeVisible();
    await page.getByRole("link", { name: ui.compass.sign_button }).click();
    await expect(page).toHaveURL(/\/kompas\/podpis/);
  });

  await test.step("podpis (§7.1)", async () => {
    await expect(page.getByText(sentences.intro.text).first()).toBeVisible();
    await page.getByLabel(/jméno/i).first().fill("Jana Akceptační");
    await page.getByLabel(/e-mail/i).first().fill(`e2e.${Date.now()}.${testInfo.project.name}@kompas-test.cz`);
    const showName = page.getByRole("checkbox", { name: /zobrazit/i });
    if (await showName.count()) await expect(showName.first()).not.toBeChecked(); // výchozí vypnuto
    await page.getByRole("checkbox", { name: /souhlas/i }).first().check();
    await page.getByRole("button", { name: /podepsat|podepiš|odeslat/i }).last().click();
  });

  let uuid = "";
  await test.step("POC ověření – odkaz na obrazovce se štítkem Ukázkový režim (§0.3)", async () => {
    await expect(page.getByText("Ukázkový režim").first()).toBeVisible({ timeout: 30_000 });
    const link = page.locator('a[href*="/overeni/"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(/\/v\/[0-9a-f-]{36}/, { timeout: 30_000 });
    uuid = /\/v\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  });

  await test.step("osobní stránka /v/[uuid] (§7.3)", async () => {
    await expect(page.getByText(sentences.intro.text).first()).toBeVisible();
    await expect(page.getByText("Jana Akceptační")).toHaveCount(0); // jméno jen se souhlasem
    await expect(page.getByRole("heading", { name: stance.title })).toBeVisible();
    for (const name of [/sdílet|sdílej/i, /porovnat|porovnej/i, /můj zákon/i])
      await expect(page.getByRole("link", { name }).or(page.getByRole("button", { name })).first()).toBeVisible();
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots ?? "").toMatch(/noindex/);
  });

  await test.step("srovnání (§8)", async () => {
    await page.getByRole("link", { name: /porovnat|porovnej/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/v/${uuid}/srovnani`));
    await expect(page.getByText(/\d+\s?%/).first()).toBeVisible();
  });

  await test.step("Můj zákon (§10)", async () => {
    await page.goto(`/v/${uuid}`);
    await page.getByRole("link", { name: /můj zákon/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/v/${uuid}/zakon`));
    await expect(page.getByText(lawBase.labels.working_draft).first()).toBeVisible();
    await expect(page.getByText(lawBase.labels.disclaimer).first()).toBeVisible();
    await expect(page.getByText(new RegExp(esc(uuid))).first()).toBeVisible();
  });

  await test.step("akce – dopisy (§9.2)", async () => {
    await page.goto("/akce");
    await page.getByRole("checkbox", { name: letterLabel("ministr-kultury") }).or(page.getByLabel(letterLabel("ministr-kultury"))).first().check();
    await expect(page.getByText(/Připraveno pomocí/).first()).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible();
  });

  await test.step("fotka (§9.3)", async () => {
    await page.goto("/fotka");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "ja.png", mimeType: "image/png", buffer: makePng() });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /stáhnout|stáhni|png/i }).first().click();
    expect((await download).suggestedFilename()).toMatch(/\.(png|jpe?g)$/i);
  });
});
