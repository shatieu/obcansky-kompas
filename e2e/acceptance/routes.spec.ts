/**
 * SPEC §13 – všechny stránky vrací 200; /org/[token] s neplatným tokenem = not found;
 * /v/* má noindex (§7.3); /.well-known/security.txt (§13, §15 m14);
 * pruh „Ukázková data“ na stránkách se statistikami v DEMO_MODE (§0.3, §14.3).
 */
import { expect, test } from "@playwright/test";
import { demoSignatureId, SPEC_ROUTES_STATIC } from "./helpers";

test.describe("§13 stránky", () => {
  for (const route of SPEC_ROUTES_STATIC)
    test(`${route} → 200`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await expect(page.locator("main h1").first()).toBeVisible();
    });

  for (const sub of ["", "/srovnani", "/zakon"])
    test(`/v/[uuid]${sub} → 200 a noindex`, async ({ page }) => {
      const uuid = await demoSignatureId();
      const res = await page.goto(`/v/${uuid}${sub}`);
      expect(res?.status()).toBe(200);
      const meta = (await page.locator('meta[name="robots"]').getAttribute("content").catch(() => null)) ?? "";
      const header = res?.headers()["x-robots-tag"] ?? "";
      expect(`${meta} ${header}`).toMatch(/noindex/);
    });

  test("/v/[neexistující uuid] → 404", async ({ page }) => {
    const res = await page.goto("/v/00000000-0000-4000-8000-000000000000");
    expect(res?.status()).toBe(404);
  });

  test("/org/[neplatný token] → 404", async ({ page }) => {
    const res = await page.goto("/org/neplatny-token-0123456789abcdef");
    expect(res?.status()).toBe(404);
  });

  test("/org/* má noindex (neveřejné)", async ({ request }) => {
    const res = await request.get("/org/neplatny-token-0123456789abcdef");
    const html = await res.text();
    expect(`${res.headers()["x-robots-tag"] ?? ""} ${html}`).toMatch(/noindex/);
  });

  test("/.well-known/security.txt: Contact a Expires (RFC 9116)", async ({ request }) => {
    const res = await request.get("/.well-known/security.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toMatch(/^Contact:\s*\S+/m);
    const exp = /^Expires:\s*(\S+)/m.exec(body);
    expect(exp).not.toBeNull();
    expect(new Date(exp![1]!).getTime()).toBeGreaterThan(Date.now());
  });

  test("GET /api/stats → 200, Cache-Control s-maxage=60, stale-while-revalidate=300", async ({ request }) => {
    const res = await request.get("/api/stats");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });

  test("/metodika/zdroje odkazuje na otevřená data a zdroje s verdikty", async ({ page }) => {
    await page.goto("/metodika/zdroje");
    // Skupiny jsou za rozbalením „Co to znamená?“ (Disclosure) – otevři první.
    await page.locator("main .k-disc").first().click();
    await expect(page.locator('main a[href^="http"]').first()).toBeVisible();
  });

  test("/metodika otevřeně říká, že ověření dělají AI agenti (§11.3)", async ({ page }) => {
    await page.goto("/metodika");
    await expect(page.getByText(/AI|umělá inteligence/).first()).toBeVisible();
  });
});

test.describe("§14.3 pruh „Ukázková data“ (DEMO_MODE=1)", () => {
  test.skip(process.env.E2E_DEMO_MODE === "0", "server běží bez DEMO_MODE");
  for (const route of ["/", "/statistiky"])
    test(`${route} ukazuje pruh Ukázková data`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByText(/Ukázková data/).first()).toBeVisible();
    });
  test("/v/[uuid]/srovnani ukazuje pruh Ukázková data", async ({ page }) => {
    await page.goto(`/v/${await demoSignatureId()}/srovnani`);
    await expect(page.getByText(/Ukázková data/).first()).toBeVisible();
  });
});

test.describe("§8 statistiky", () => {
  test("pod grafem je upozornění na nereprezentativní vzorek", async ({ page }) => {
    await page.goto("/statistiky");
    await expect(page.getByText("Vzorek lidí, kteří kompas vyplnili. Není to reprezentativní průzkum.").first()).toBeVisible();
  });
  test("odkaz na otevřená data stáhne CSV", async ({ page }) => {
    await page.goto("/statistiky");
    const dl = page.waitForEvent("download");
    await page.locator('a[href*="open-data"], a[href$=".csv"]').first().click();
    expect((await dl).suggestedFilename()).toMatch(/\.csv$/);
  });
});

test.describe("§16 A STATIC_DEMO=1", () => {
  test.skip(process.env.E2E_STATIC_DEMO !== "1", "spouští se jen proti serveru se STATIC_DEMO=1 (E2E_STATIC_DEMO=1)");
  test("podpis je vypnutý s hláškou", async ({ page }) => {
    await page.goto("/kompas/podpis");
    await expect(page.getByText("V ukázce zatím nelze podepsat").first()).toBeVisible();
  });
});
