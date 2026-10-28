/**
 * SPEC §5 / §4.4 – kompas v prohlížeči: jedna otázka na obrazovku (mobil), zašedlé volby se
 * štítkem „Nejde s:“ otevírají vysvětlení místo výběru, změna dřívější volby zruší neplatné
 * pozdější odpovědi, localStorage, funguje bez serveru, živý náhled textu, blok „Kde stojíme my“.
 * Pořadí otázek je z questions.yaml `order` (peníze/Q1 jsou poslední), navigace umí skočit
 * na libovolnou otázku, přehled na konci mění odpovědi na místě.
 */
import { expect, test, type Page } from "@playwright/test";
import { answerCompass, clickNext, currentHeading, demoSignatureId, esc, isMobile, JOURNEY, ORDER, q, questions, sentences, optionId, stance, templatePrefix, ui } from "./helpers";

/** Doplní {klíč} v šabloně z ui.yaml. */
const t = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

const Q2_BUDGET = "Státní rozpočet s pojistkami";
const Q3_GOV = "Vláda a poslanci každý rok";

/** Segment navigace otázky v pořadí zobrazení (1…8). */
const navSeg = (page: Page, n: number) =>
  page.getByRole("navigation", { name: ui.compass.nav_aria }).getByRole("button", { name: new RegExp(`^Otázka ${n} z ${ORDER.length}:`) });

/** Na otázku přes navigaci (skok na libovolnou otázku). */
async function gotoQ(page: Page, qid: string) {
  if ((await currentHeading(page)) === q(qid).text) return;
  await navSeg(page, ORDER.indexOf(qid) + 1).click();
  await expect.poll(() => currentHeading(page)).toBe(q(qid).text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/kompas");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState("networkidle"); // stav z localStorage/#hash se načítá až po hydrataci
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
  expect(await currentHeading(page)).toBe(q(ORDER[0]!).text);
  await clickNext(page);
  expect(await currentHeading(page)).toBe(q(ORDER[1]!).text);
  expect(await visibleQuestions()).toBe(1);
});

test("pořadí: první je Q2, peníze (Q1) jsou poslední; navigace skočí z první otázky na poslední", async ({ page }) => {
  expect(ORDER[0]).toBe("q2");
  expect(ORDER.at(-1)).toBe("q1");
  expect(await currentHeading(page)).toBe(q("q2").text);
  const nav = page.getByRole("navigation", { name: ui.compass.nav_aria });
  const segs = nav.locator("button.k-qnav__seg");
  await expect(segs).toHaveCount(ORDER.length);
  // Názvy segmentů: „Otázka {n} z 8: {short} – {stav}“, aktuální má aria-current="step".
  for (const [i, id] of ORDER.entries())
    await expect(segs.nth(i)).toHaveAccessibleName(new RegExp(`^Otázka ${i + 1} z ${ORDER.length}: ${esc(q(id).short)} – `));
  await expect(segs.first()).toHaveAttribute("aria-current", "step");
  await expect(segs.first()).toHaveAttribute("data-s", "current");

  await navSeg(page, ORDER.length).click();
  await expect.poll(() => currentHeading(page)).toBe(q("q1").text);
  await expect(page).toHaveURL(/#q1$/);
  await expect(segs.last()).toHaveAttribute("aria-current", "step");
  await expect(segs.first()).not.toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("slider").first()).toBeVisible();
});

test("přehled na konci: změna odpovědi na místě přepíše text živě a zvýrazní zrušené odpovědi (§5.2)", async ({ page }) => {
  await answerCompass(page, JOURNEY);
  expect(await currentHeading(page)).toBe(ui.compass.summary_title);
  const statement = page.locator("main .k-letter");
  const oldQ2 = sentences.options[optionId("q2", "Poplatek jako dnes")]!.text!;
  const newQ2 = sentences.options[optionId("q2", Q2_BUDGET)]!.text!;
  await expect(statement).toContainText(oldQ2);
  await expect(page.locator("li.k-sumrow[data-invalid]")).toHaveCount(0);

  // Text po odstavcích (požadavek vlastníka 2026-10-28): úvod, blok se štítkem za každou
  // otázku v pořadí zobrazení, závěr; štítek vede na řádek odpovědi.
  const blocks = statement.locator(".k-stmt__block");
  await expect(blocks).toHaveCount(ORDER.length);
  await expect(blocks.locator(".k-stmt__label")).toHaveText(ORDER.map((id) => q(id).short));
  await expect(statement.locator(".k-stmt__end").first()).toHaveText(sentences.intro.text);
  await expect(statement.locator('.k-stmt__block[data-q="q2"]')).toContainText(oldQ2);
  await statement.getByRole("link", { name: q("q6").short, exact: true }).click();
  await expect(page.locator("#sum-row-q6")).toBeFocused();
  await expect(page).toHaveURL(/#text$/);

  await page.getByRole("button", { name: t(ui.compass.change_aria, { question: q("q2").text }) }).click();
  const row = page.locator('li.k-sumrow[data-q="q2"]');
  await row.getByRole("radio", { name: Q2_BUDGET, exact: true }).click();

  // Text se přepsal bez přechodu na jinou obrazovku.
  await expect(statement).toContainText(newQ2);
  await expect(statement).not.toContainText(oldQ2);
  expect(await currentHeading(page)).toBe(ui.compass.summary_title);
  await expect(row.locator(".k-sumrow__value")).toHaveText(Q2_BUDGET);
  // Rozpočet zruší odpověď „Každá domácnost“ (Q4) – řádek je zvýrazněný, změněná otázka ne.
  await expect(page.locator('li.k-sumrow[data-q="q4"]')).toHaveAttribute("data-invalid", "true");
  await expect(row).not.toHaveAttribute("data-invalid", /.*/);
  await expect(page.locator('li.k-sumrow[data-q="q4"]').getByText(ui.compass.invalidated_short)).toBeVisible();
});

test("tlačítko „Přehled odpovědí“ v navigaci vede na přehled", async ({ page }) => {
  await page.getByRole("radio", { name: "Poplatek jako dnes", exact: true }).click();
  await page.getByRole("button", { name: ui.compass.summary_nav_button }).click();
  await expect.poll(() => currentHeading(page)).toBe(ui.compass.summary_title);
  await expect(page).toHaveURL(/#text$/);
});

test("zašedlá volba: štítek „Nejde s: …“, klepnutí otevře vysvětlení, ne výběr (§4.4, §5.2)", async ({ page }) => {
  await gotoQ(page, "q2");
  await page.getByRole("radio", { name: Q2_BUDGET, exact: true }).click();
  await clickNext(page);
  expect(await currentHeading(page)).toBe(q("q3").text);
  const label = templatePrefix(ui.compass.disabled_label); // „Nejde s:“
  await expect(page.getByText(new RegExp(`${label}\\s*${Q2_BUDGET}`)).first()).toBeVisible();
  // Design system: zašedlá volba zůstává role="radio" s aria-disabled (klikací kvůli vysvětlení).
  const greyed = page.getByRole("radio", { name: new RegExp(Q3_GOV), disabled: true }).first();
  // aria-disabled = Playwright ji bere jako „not enabled“; uživatel na ni klepnout může (otevře vysvětlení).
  await greyed.click({ force: true });
  await expect(greyed).toHaveAttribute("aria-expanded", "true");
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
  await page.waitForLoadState("networkidle");
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
  // Mobil: rozbalený řádek „Můj text“; desktop: boční panel (sbalený mobilní řádek je skrytý).
  await expect(page.getByText(sentences.options[optionId("q2", "Poplatek jako dnes")]!.text!).filter({ visible: true }).first()).toBeVisible();
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
  await page.goto("/kompas#q1");
  await page.waitForLoadState("networkidle");
  await expect.poll(() => currentHeading(page)).toBe(q("q1").text);
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
