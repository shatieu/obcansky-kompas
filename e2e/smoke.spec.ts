import { expect, test } from "@playwright/test";

test("hlavní stránka a kompas se načtou", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await page.goto("/kompas");
  await expect(page.locator("h1, h2").first()).toBeVisible();
});
