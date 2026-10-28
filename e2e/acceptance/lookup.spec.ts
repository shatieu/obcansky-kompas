/**
 * Číslo podpisu a „Načíst moje odpovědi“ (požadavek vlastníka 2026-10-28): odpovědět a podepsat
 * v jednom prohlížeči, v čistém kontextu (jiný počítač) načíst odpovědi číslem podpisu a vidět je
 * v přehledu. Krátký odkaz /v/<číslo> přesměruje na /v/<uuid>.
 * Předpoklady jako journey.spec.ts: POC_MODE=1, Turnstile testovací klíče.
 */
import { expect, test } from "@playwright/test";
import { answerCompass, JOURNEY, randomIp, ui } from "./helpers";

test("číslo podpisu: podpis v jednom prohlížeči → načtení odpovědí v jiném", async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });

  await page.goto("/kompas");
  await answerCompass(page, JOURNEY);
  await page.getByRole("link", { name: ui.compass.sign_button }).click();
  await expect(page).toHaveURL(/\/kompas\/podpis/, { timeout: 30_000 });
  await page.getByLabel(/jméno/i).first().fill("Jana Číslo");
  await page.getByLabel(/e-mail/i).first().fill(`e2e.lookup.${Date.now()}.${testInfo.project.name}@example.com`);
  await page.getByRole("checkbox", { name: /souhlas/i }).first().check();
  await expect(page.locator('input[name="cf-turnstile-response"]').first()).toHaveValue(/.+/, { timeout: 60_000 });
  await page.getByRole("button", { name: /podepsat|podepiš|odeslat/i }).last().click();

  // POC: číslo podpisu hned na obrazovce vedle ověřovacího odkazu.
  const pocId = page.getByTestId("short-id").first();
  await expect(pocId).toBeVisible({ timeout: 30_000 });
  const shortId = (await pocId.innerText()).trim();
  expect(shortId).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);

  await page.locator('main a[href*="/overeni/"]').first().click();
  await page.waitForURL(/\/v\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const uuid = /\/v\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await expect(page.getByText(ui.lookup.short_id_label)).toBeVisible();
  await expect(page.getByTestId("short-id")).toHaveText(shortId);

  // Jiný počítač: čistý kontext bez localStorage.
  const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined, baseURL: testInfo.project.use.baseURL });
  const other = await ctx.newPage();
  await other.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  try {
    await other.goto("/kompas");
    const link = other.getByRole("button", { name: ui.lookup.link, exact: true });
    await expect(async () => {
      await link.click({ timeout: 2_000 });
      await expect(other.getByLabel(ui.lookup.input_label)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    // malými písmeny a bez pomlčky
    await other.getByLabel(ui.lookup.input_label).fill(shortId.replace("-", "").toLowerCase());
    await other.getByRole("button", { name: ui.lookup.submit_button }).click();

    await expect(other.getByTestId("lookup-done")).toBeVisible({ timeout: 30_000 });
    await expect(other.locator("main h1").first()).toHaveText(ui.compass.summary_title);
    await expect(other.locator("#sum-row-q2")).toContainText(JOURNEY.q2 as string);
    await expect(other.locator("#sum-row-q8")).toContainText(JOURNEY.q8 as string);
    await expect(other.getByRole("link", { name: ui.lookup.open_page_button })).toHaveAttribute("href", `/v/${uuid}`);

    // Uloženo v prohlížeči: po obnovení přehled odpovědí zůstane.
    await other.goto("/kompas#text");
    await expect(other.locator("#sum-row-q2")).toContainText(JOURNEY.q2 as string);

    // Krátký odkaz /v/<číslo> → 308 na /v/<uuid>.
    const res = await other.request.get(`/v/${shortId.toLowerCase()}`, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toContain(`/v/${uuid}`);
  } finally {
    await ctx.close();
  }
});
