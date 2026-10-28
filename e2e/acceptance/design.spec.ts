/**
 * SPEC §4.3 / §4.4 – pravidla kontrolovatelná v DOM. Upraveno podle designového systému
 * vlastníka (docs/design-system/project), který část §4 přepisuje:
 *  - border-radius 0 všude; výjimky jen kruhy (náhled profilové fotky, značka výběru) –
 *    test proto toleruje jen PLNÉ kruhy (radius ≥ polovina rozměru), ne zaoblené rohy,
 *  - žádné stíny, žádné (ne-repeating) přechody,
 *  - pohyb: běžné přechody krátké; delší jen bottom sheet 240 ms, vlajka 500 ms, rozvinutí 800 ms
 *    → test volně: nic delšího než 800 ms,
 *  - respektovat prefers-reduced-motion, dotykové plochy ≥ 48 px, žádné emoji.
 * Font (Mona Sans podle design systému, ne Inter Tight) se netestuje natvrdo – jen self-host.
 */
import { expect, test, type Page } from "@playwright/test";
import { isMobile, stance, ui } from "./helpers";

const PAGES = ["/", "/kompas", "/statistiky", "/akce", "/fotka", "/metodika"];

async function styleViolations(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const px = (v: string) => parseFloat(v) || 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius];
      const isCircle = radii.every((x) => x.endsWith("%") ? parseFloat(x) >= 50 : px(x) >= Math.min(r.width, r.height) / 2 - 0.5);
      if (radii.some((x) => px(x) > 0) && !isCircle) out.push(`radius ${radii.join(" ")} <${el.tagName.toLowerCase()} class="${el.className}">`);
      if (cs.boxShadow !== "none" && !el.matches(":focus, :focus-visible, :focus-within")) out.push(`box-shadow ${cs.boxShadow} <${el.tagName.toLowerCase()}>`);
      if (/(^|[^-])linear-gradient|radial-gradient|conic-gradient/.test(cs.backgroundImage.replace(/repeating-(linear|radial|conic)-gradient/g, "")))
        out.push(`gradient <${el.tagName.toLowerCase()} class="${el.className}">`);
      if (/blur\(/.test(cs.backdropFilter || "")) out.push(`glassmorphism <${el.tagName.toLowerCase()}>`);
    }
    return out;
  });
}

test.describe("§4.3 vizuální pravidla v DOM", () => {
  for (const route of PAGES)
    test(`${route}: žádné zaoblené rohy (kromě kruhů), stíny, přechody`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(await styleViolations(page)).toEqual([]);
    });

  test("/kompas: přechody max. 800 ms (delší než 160 ms jen výjimky design systému)", async ({ page }) => {
    await page.goto("/kompas");
    const long = await page.evaluate(() => {
      const ms = (v: string) => v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000));
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const cs = getComputedStyle(el);
        const max = Math.max(...ms(cs.transitionDuration), ...ms(cs.animationDuration));
        if (max > 800) out.push(`${el.tagName.toLowerCase()} ${max}ms`);
      }
      return out;
    });
    expect(long).toEqual([]);
  });

  test("žádné emoji v textu stránek", async ({ page }) => {
    for (const route of ["/", "/kompas", "/statistiky"]) {
      await page.goto(route);
      const text = await page.locator("body").innerText();
      expect(/\p{Extended_Pictographic}/u.test(text), route).toBe(false);
    }
  });
});

test.describe("§4.3 prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });
  for (const route of ["/", "/kompas"])
    test(`${route}: při reduce neběží žádné animace delší než 10 ms`, async ({ page }) => {
      await page.goto(route);
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .map((a) => Number(a.effect?.getComputedTiming().duration ?? 0))
          .filter((d) => d > 10),
      );
      expect(running).toEqual([]);
    });
});

test.describe("§4.3 dotykové plochy ≥ 48 × 48 px", () => {
  const check = async (page: Page) =>
    page.evaluate(() => {
      const out: string[] = [];
      const els = document.querySelectorAll<HTMLElement>("main button, main [role=radio], main [role=checkbox], main a, main input[type=checkbox], main select");
      for (const el of Array.from(els)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[aria-hidden=true]")) continue;
        if (el.tagName === "A" && cs.display === "inline") continue; // odkaz v textu
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // checkbox může mít menší čtvereček, pokud je klikací celý label
        if (el instanceof HTMLInputElement && el.labels?.length) {
          const lr = el.labels[0]!.getBoundingClientRect();
          if (lr.height >= 47.5) continue;
        }
        if (r.width < 47.5 || r.height < 47.5) out.push(`${el.tagName.toLowerCase()} „${(el.innerText || el.getAttribute("aria-label") || "").slice(0, 30)}“ ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return out;
    });
  for (const route of ["/", "/kompas", "/akce", "/fotka"])
    test(route, async ({ page }) => {
      await page.goto(route);
      expect(await check(page)).toEqual([]);
    });
});

test.describe("§4.4 komponenty", () => {
  test("volba: celá šířka, min. výška 56 px, linka 2 px", async ({ page }) => {
    await page.goto("/kompas");
    await page.getByRole("button", { name: ui.compass.next_button, exact: true }).click();
    const opt = page.getByRole("radio").first();
    const box = (await opt.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(56);
    const group = (await page.locator('[role="radiogroup"]').first().boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(group.width - 1);
    expect(await opt.evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("2px");
  });

  test("mobil: primární akce přilepená dole přes šířku", async ({ page }) => {
    test.skip(!isMobile(page), "jen mobil");
    await page.goto("/kompas");
    const next = page.getByRole("button", { name: ui.compass.next_button, exact: true });
    const box = (await next.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
    expect(box.y + box.height).toBeGreaterThan(vp.height - 100);
    expect(box.width).toBeGreaterThan(vp.width * 0.5);
  });

  // Design system: h1 na mobilu 30/32 px (tokens.json), přepisuje SPEC §4.3 (32–40 px).
  test("mobil: nadpis otázky 30–40 px", async ({ page }) => {
    test.skip(!isMobile(page), "jen mobil");
    await page.goto("/kompas");
    const size = await page.locator("main h1").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(size).toBeGreaterThanOrEqual(30);
    expect(size).toBeLessThanOrEqual(40);
  });

  test("blok postoje má inverzní (plnou) plochu oddělenou od kompasu (§9.1)", async ({ page }) => {
    await page.goto("/");
    const block = page.getByRole("heading", { name: stance.title }).locator("xpath=ancestor::section[1]");
    const bg = await block.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent|rgb\(255, 255, 255\)/);
  });

  test("hero: ilustrace demonstrace bez textu vede do davu a nepřekrývá vlajku", async ({ page }) => {
    await page.goto("/");
    const pic = page.getByRole("link", { name: ui.home.demo_aria, exact: true });
    await expect(pic).toHaveAttribute("href", "/demonstrace");
    await expect(pic.locator("text, tspan")).toHaveCount(0);
    await expect(page.locator("#h-home").locator("xpath=ancestor::section[1]").getByRole("link", { name: ui.home.demo_button, exact: true })).toHaveAttribute(
      "href",
      "/demonstrace",
    );
    const flag = await page.locator("section .k-flag").first().boundingBox();
    const crowd = await pic.boundingBox();
    expect(flag && crowd).toBeTruthy();
    // Vlajka je sama: ochranná zóna ≥ ¼ výšky vlajky mezi ní a davem (README „Vlajka“).
    const gap = Math.max(crowd!.y - (flag!.y + flag!.height), flag!.y - (crowd!.y + crowd!.height));
    expect(gap).toBeGreaterThanOrEqual(flag!.height / 4 - 1);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sw).toBeLessThanOrEqual(0);
    // Cesta do demonstrace je vidět bez posunu: ilustrace začíná v prvním výřezu (nad přilepeným tlačítkem).
    const vh = page.viewportSize()!.height;
    expect(crowd!.y).toBeLessThan(vh - 120);
  });

  test("Demonstrace v hlavičce (mobil i desktop, cíl ≥ 48 px) a v patičce", async ({ page }) => {
    await page.goto("/statistiky");
    const head = page.locator("header.k-appbar").getByRole("link", { name: ui.nav.demo, exact: true });
    await expect(head).toBeVisible();
    await expect(head).toHaveAttribute("href", "/demonstrace");
    expect((await head.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(page.locator("footer").getByRole("link", { name: ui.footer.demo, exact: true })).toHaveAttribute("href", "/demonstrace");
  });

  test("statistiky: čísla s tabular-nums (§4.3)", async ({ page }) => {
    await page.goto("/statistiky");
    const n = await page.evaluate(
      () => Array.from(document.querySelectorAll<HTMLElement>("main *")).filter((e) => getComputedStyle(e).fontVariantNumeric.includes("tabular-nums")).length,
    );
    expect(n).toBeGreaterThan(0);
  });
});
