/**
 * SPEC §9.2, §9.3, §9.4, §10 – exporty v prohlížeči (PDF, DOCX, ZIP, PNG/JPG) jako stažení;
 * fotka nikdy neopustí prohlížeč; obsah dopisů se neposílá na server (jen letter_prepared);
 * OG obrázek 1200×630; seed a posuvníky dopisu v URL.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Request } from "@playwright/test";
import { answerCompass, demoSignatureId, imageSize, JOURNEY, letterLabel, looksLikeImage, makePng, slogans } from "./helpers";

function record(page: Page) {
  const reqs: Request[] = [];
  page.on("request", (r) => reqs.push(r));
  return reqs;
}
const bodyOf = (r: Request) => r.postDataBuffer() ?? Buffer.alloc(0);

async function downloadVia(page: Page, name: RegExp) {
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name }).or(page.getByRole("link", { name })).first().click();
  return dl;
}

test.describe("§10 Můj zákon – PDF a DOCX", () => {
  test("PDF a DOCX se stáhnou", async ({ page }) => {
    await page.goto(`/v/${await demoSignatureId()}/zakon`);
    const pdf = await downloadVia(page, /pdf/i);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe("%PDF-");
    const docx = await downloadVia(page, /docx|word/i);
    expect(docx.suggestedFilename()).toMatch(/\.docx$/i);
    expect(readFileSync((await docx.path())!).subarray(0, 2).toString()).toBe("PK");
  });
});

test.describe("§9.2 /akce – dopisy", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/kompas");
    await answerCompass(page, JOURNEY);
  });

  test("PDF, ZIP, mailto; obsah dopisu se neposílá, server dostane jen letter_prepared", async ({ page }) => {
    const reqs = record(page);
    await page.goto("/akce");
    await page.getByLabel(letterLabel("ministr-kultury")).first().check();
    await page.getByLabel(letterLabel("prezident")).first().check();
    const marker = "Unikatni vlastni veta 4711.";
    const own = page.getByLabel(/vlastní věta|vlastní větu/i);
    if (await own.count()) await own.first().fill(marker);
    await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible();
    const pdf = await downloadVia(page, /pdf/i);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/i);
    const zip = await downloadVia(page, /zip|všechn/i);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/i);
    await page.waitForTimeout(500);

    const sent = reqs.filter((r) => r.method() !== "GET" || new URL(r.url()).search.length > 0);
    for (const r of sent) {
      const all = `${r.url()} ${bodyOf(r).toString("utf8")}`;
      expect(all).not.toContain(marker);
      expect(all).not.toContain("Připraveno pomocí");
    }
    expect(reqs.some((r) => `${r.url()} ${bodyOf(r).toString("utf8")}`.includes("letter_prepared"))).toBe(true);
  });

  test("„Jiná varianta“ změní seed; seed a posuvníky jsou v URL", async ({ page }) => {
    await page.goto("/akce");
    await page.getByLabel(letterLabel("ministr-kultury")).first().check();
    const before = page.url();
    await page.getByRole("button", { name: /jiná varianta/i }).click();
    await expect.poll(() => page.url()).not.toBe(before);
    const params = new URL(page.url()).searchParams;
    expect([...params.keys()].length).toBeGreaterThanOrEqual(3); // seed + forma + délka
    const url = page.url();
    const text = await page.locator("main").innerText();
    await page.goto(url);
    expect(await page.locator("main").innerText()).toBe(text);
  });

  test("úřady: ID datové schránky a krátký návod", async ({ page }) => {
    await page.goto("/akce");
    await page.getByLabel(letterLabel("kraj")).first().check();
    await expect(page.getByText(/datov(á|é) schránk/i).first()).toBeVisible();
  });
});

test.describe("§9.3 /fotka", () => {
  test("fotka nikdy neopustí prohlížeč; výstup PNG a JPG 1080×1080; jen frame_downloaded", async ({ page }) => {
    const reqs = record(page);
    await page.goto("/fotka");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "portret.png", mimeType: "image/png", buffer: makePng(800, 600) });
    await expect(page.getByText(slogans.slogans[0]!.text).first()).toBeVisible();

    const png = await downloadVia(page, /png/i);
    expect(png.suggestedFilename()).toMatch(/\.png$/i);
    expect(imageSize(readFileSync((await png.path())!))).toEqual({ w: 1080, h: 1080 });
    const jpg = await downloadVia(page, /jpg|jpeg/i);
    expect(jpg.suggestedFilename()).toMatch(/\.jpe?g$/i);
    expect(imageSize(readFileSync((await jpg.path())!))).toEqual({ w: 1080, h: 1080 });
    await page.waitForTimeout(500);

    for (const r of reqs) {
      expect(looksLikeImage(r.postDataBuffer()), `${r.method()} ${r.url()}`).toBe(false);
      expect(r.headers()["content-type"] ?? "").not.toMatch(/^image\/|multipart\/form-data/);
    }
    expect(reqs.some((r) => `${r.url()} ${bodyOf(r).toString("utf8")}`.includes("frame_downloaded"))).toBe(true);
  });

  test("všechny čtyři varianty rámečku a jen slogany ze slogans.yaml", async ({ page }) => {
    await page.goto("/fotka");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "p.png", mimeType: "image/png", buffer: makePng() });
    for (const s of slogans.slogans) await expect(page.getByText(s.text).first()).toBeVisible();
    for (const v of [/kruh/i, /stuh/i, /štítek/i, /duotone/i]) await expect(page.getByText(v).first()).toBeVisible();
  });
});

test.describe("§9.4 sdílení", () => {
  test("osobní stránka má OG obrázek 1200×630", async ({ page, request }) => {
    await page.goto(`/v/${await demoSignatureId()}`);
    const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(og).toBeTruthy();
    const res = await request.get(og!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image\/png/);
    expect(imageSize(await res.body())).toEqual({ w: 1200, h: 630 });
  });

  test("desktop: stažení obrázku ke sdílení (story 1080×1920 nebo čtverec 1080×1080) a ?s=<moment> v odkazu", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, "na mobilu Web Share API");
    await page.goto(`/v/${await demoSignatureId()}`);
    await page.getByRole("button", { name: /sdílet|sdílej/i }).or(page.getByRole("link", { name: /sdílet|sdílej/i })).first().click();
    const dl = await downloadVia(page, /stáhnout|stáhni/i);
    const size = imageSize(readFileSync((await dl.path())!));
    expect([JSON.stringify({ w: 1080, h: 1920 }), JSON.stringify({ w: 1080, h: 1080 })]).toContain(JSON.stringify(size));
    const html = await page.content();
    expect(html).toMatch(/[?&]s=[a-z-]+/);
  });
});
