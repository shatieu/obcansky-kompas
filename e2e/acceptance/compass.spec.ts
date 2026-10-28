/**
 * SPEC §5 / §4.4 – kompas v prohlížeči: jedna otázka na obrazovku (mobil), zašedlé volby se
 * štítkem „Nejde s:“ otevírají vysvětlení místo výběru, změna dřívější volby zruší neplatné
 * pozdější odpovědi, localStorage, funguje bez serveru, živý náhled textu, blok „Kde stojíme my“.
 */
import { expect, test } from "@playwright/test";
import { clickNext, currentHeading, demoSignatureId, isMobile, q, questions, sentences, optionId, stance, templatePrefix, ui } from "./helpers";

const Q2_BUDGET = "Státní rozpočet s pojistkami";
const Q3_GOV = "Vláda a poslanci každý rok";

async function gotoQ(page: import("@playwright/test").Page, qid: string) {
  for (let i = 0; i < 10; i++) {
    if ((await currentHeading(page)) === q(qid).text) return;
    await clickNext(page);
  }
  throw new Error(`na ${qid} se nepodařilo dojít`);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/kompas");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("mobil: jedna otázka na obrazovku", async ({ page }) => {
  test.skip(!isMobile(page), "jen mobil");
  const visibleQuestions = async () => {
    let n = 0;
    for (const x of questions.questions) if (await page.getByRole("heading", { name: x.text, exact: true }).isVisible().catch(() => false)) n++;
    return n;
  };
  expect(await visibleQuestions()).toBe(1);
  await expect(page.locator('[role="radiogroup"]:visible, [role="group"]:visible')).toHaveCount(1);
  await clickNext(page);
  expect(await currentHeading(page)).toBe(q("q2").text);
  expect(await visibleQuestions()).toBe(1);
});

test("zašedlá volba: štítek „Nejde s: …“, klepnutí otevře vysvětlení, ne výběr (§4.4, §5.2)", async ({ page }) => {
  await gotoQ(page, "q2");
  await page.getByRole("radio", { name: Q2_BUDGET, exact: true }).click();
  await clickNext(page);
  expect(await currentHeading(page)).toBe(q("q3").text);
  const label = templatePrefix(ui.compass.disabled_label); // „Nejde s:“
  await expect(page.getByText(new RegExp(`${label}\\s*${Q2_BUDGET}`)).first()).toBeVisible();
  const greyed = page.getByRole("button", { name: new RegExp(Q3_GOV) }).first();
  await greyed.click();
  await expect(page.getByRole("radio", { name: Q3_GOV, checked: true })).toHaveCount(0);
  await expect(page.getByText(templatePrefix(ui.compass.disabled_explain)).first()).toBeVisible();
});

test("předvyplnění: Q2 = Návrh vlády předvyplní Q3 „Zákon…“ (§5.2)", async ({ page }) => {
  await gotoQ(page, "q2");
  await page.getByRole("radio", { name: "Návrh vlády", exact: true }).click();
  await clickNext(page);
  await expect(page.getByRole("radio", { name: "Zákon, s růstem podle inflace", checked: true })).toBeVisible();
});

test("změna dřívější volby zruší neplatné pozdější odpovědi a zvýrazní je (§5.2)", async ({ page }) => {
  await gotoQ(page, "q2");
  await page.getByRole("radio", { name: "Poplatek jako dnes", exact: true }).click();
  await clickNext(page);
  await page.getByRole("radio", { name: Q3_GOV, exact: true }).click();
  await expect(page.getByRole("radio", { name: Q3_GOV, checked: true })).toBeVisible();
  await page.getByRole("button", { name: ui.compass.back_button }).click();
  expect(await currentHeading(page)).toBe(q("q2").text);
  await page.getByRole("radio", { name: Q2_BUDGET, exact: true }).click();
  await clickNext(page);
  await expect(page.getByRole("radio", { name: Q3_GOV, checked: true })).toHaveCount(0);
  await expect(page.getByText(ui.compass.invalidated_note).first()).toBeVisible();
});

test("odpovědi přežijí reload (localStorage, §5.4)", async ({ page }) => {
  await gotoQ(page, "q2");
  await page.getByRole("radio", { name: "Zvláštní poplatek přes daně", exact: true }).click();
  const stored = await page.evaluate(() => Object.values({ ...localStorage }).join(" "));
  expect(stored).toContain(optionId("q2", "Zvláštní poplatek přes daně"));
  await page.reload();
  await gotoQ(page, "q2");
  await expect(page.getByRole("radio", { name: "Zvláštní poplatek přes daně", checked: true })).toBeVisible();
});

test("kompas funguje bez serveru (všechna /api/* zablokovaná, §5.4, §14.2)", async ({ page }) => {
  await page.route("**/api/**", (r) => r.abort());
  await gotoQ(page, "q2");
  await page.getByRole("radio", { name: "Poplatek jako dnes", exact: true }).click();
  await clickNext(page);
  expect(await currentHeading(page)).toBe(q("q3").text);
});

test("živý náhled textu se aktualizuje (§6)", async ({ page }) => {
  await gotoQ(page, "q2");
  await page.getByRole("radio", { name: "Poplatek jako dnes", exact: true }).click();
  if (isMobile(page)) {
    // Sbalený řádek „Můj text“ (design system StatementPreview).
    const show = page.getByRole("button", { name: new RegExp(`^${ui.preview.title}`), expanded: false });
    if (await show.count()) await show.first().click();
  }
  await expect(page.getByText(sentences.options[optionId("q2", "Poplatek jako dnes")]!.text!).first()).toBeVisible();
});

test("každá otázka i volba má „Co to znamená?“ (§4.4, §5)", async ({ page }) => {
  await gotoQ(page, "q2");
  const nonNevim = q("q2").options.filter((o) => !o.nevim).length;
  expect(await page.getByRole("button", { name: new RegExp(ui.explainer.open) }).count()).toBeGreaterThanOrEqual(nonNevim + 1);
});

test("vysvětlivka: mobil = bottom sheet u spodního okraje, desktop = rozbalení na místě (§4.4)", async ({ page }) => {
  await gotoQ(page, "q2");
  await page.getByRole("button", { name: new RegExp(ui.explainer.open) }).first().click();
  const vh = page.viewportSize()!.height;
  if (isMobile(page)) {
    const sheet = page.getByRole("dialog").first();
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(vh - 4);
  } else {
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("Q1 posuvník: kotvy, −/+, klávesnice, přepočet na dospělého (§4.4, §5.1)", async ({ page }) => {
  expect(await currentHeading(page)).toBe(q("q1").text);
  // Design system: kotvy jsou klikací zářezy (bez statických popisků pod dráhou), název nese aria-label.
  for (const a of ["Návrh vlády", "Dnes", "Dnes +10 %"])
    await expect(page.getByRole("button", { name: new RegExp(`${a.replace(/[+]/g, "\\+")}:`) }).first()).toBeVisible();
  const slider = page.getByRole("slider").first();
  const before = Number(await slider.getAttribute("aria-valuenow") ?? (await slider.inputValue()));
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  const after = Number(await slider.getAttribute("aria-valuenow") ?? (await slider.inputValue()));
  expect(Math.round((after - before) * 10) / 10).toBe(0.1);
  await expect(page.getByRole("button", { name: ui.slider.decrease_aria })).toBeVisible();
  await expect(page.getByRole("button", { name: ui.slider.increase_aria })).toBeVisible();
  await expect(page.getByText(/Kč měsíčně na dospělého/).first()).toBeVisible();
});

test("blok „Kde stojíme my“ je pod kompasem a vede na /akce a /fotka (§1, §9.1)", async ({ page }) => {
  const stanceHeading = page.getByRole("heading", { name: stance.title });
  await expect(stanceHeading).toBeVisible();
  const qBox = (await page.locator("main h1").first().boundingBox())!;
  const sBox = (await stanceHeading.boundingBox())!;
  expect(sBox.y).toBeGreaterThan(qBox.y);
  for (const a of stance.actions) await expect(page.locator(`a[href="${a.href}"]`, { hasText: a.label }).first()).toBeVisible();
});

test("blok „Kde stojíme my“ je i na osobní stránce pod hlavními akcemi (§7.3)", async ({ page }) => {
  await page.goto(`/v/${await demoSignatureId()}`);
  const stanceHeading = page.getByRole("heading", { name: stance.title });
  await expect(stanceHeading).toBeVisible();
  const action = page.getByRole("link", { name: /porovnat|porovnej/i }).first();
  expect((await stanceHeading.boundingBox())!.y).toBeGreaterThan((await action.boundingBox())!.y);
});

test("postoj spolku se nepropisuje do kompasu (§1)", async ({ page }) => {
  for (let i = 0; i < 8; i++) {
    const main = page.locator("main section").first();
    await expect(main).not.toContainText(stance.text);
    await clickNext(page);
  }
});
