/**
 * SPEC §14.3 – bezpečnostní hlavičky (CSP s nonce, HSTS, nosniff, Referrer-Policy,
 * Permissions-Policy) a žádné externí skripty kromě Turnstile a volitelně Plausible.
 */
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/kompas", "/kompas/podpis", "/statistiky", "/akce", "/fotka", "/metodika"];
/**
 * Nonce + 'strict-dynamic' jen u stránek renderovaných při každém požadavku (DECISIONS.md
 * „Bezpečnost a výkon“); statické/ISR stránky mají pevnou CSP bez nonce a bez zástupných znaků.
 */
const NONCE_PAGES = new Set(["/kompas/podpis"]);
const ALLOWED_SCRIPT_HOSTS = ["challenges.cloudflare.com", "plausible.io"];

test.describe("§14.3 hlavičky", () => {
  for (const route of PAGES)
    test(`${route}: CSP (${NONCE_PAGES.has(route) ? "nonce" : "statická"}), HSTS, nosniff, Referrer-Policy, Permissions-Policy`, async ({ request }) => {
      const res = await request.get(route);
      const h = res.headers();
      const csp = h["content-security-policy"] ?? "";
      const scriptSrc = /(?:^|;)\s*script-src([^;]*)/.exec(csp)?.[1] ?? "";
      expect(scriptSrc).toContain("'self'");
      if (NONCE_PAGES.has(route)) {
        expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/);
        expect(scriptSrc).toContain("'strict-dynamic'");
      } else expect(scriptSrc).not.toContain("'nonce-");
      // žádný zástupný znak (*, https:, http:) ve script-src ani default-src
      for (const d of ["script-src", "default-src"]) {
        const v = new RegExp(`(?:^|;)\\s*${d}([^;]*)`).exec(csp)?.[1] ?? "";
        expect(v).not.toMatch(/(^|\s)(\*|https?:)(\s|$)/);
      }
      expect(csp).toMatch(/object-src 'none'/);
      expect(csp).toMatch(/frame-ancestors 'none'/);
      expect(h["strict-transport-security"] ?? "").toMatch(/max-age=\d+/);
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      const pp = h["permissions-policy"] ?? "";
      expect(pp.length).toBeGreaterThan(0);
      if (route !== "/fotka") expect(pp).toMatch(/camera=\(\)/);
    });

  test("nonce v CSP sedí s nonce skriptů na stránce a mění se s každým požadavkem", async ({ request }) => {
    const a = await request.get("/kompas/podpis");
    const b = await request.get("/kompas/podpis");
    const nonce = (r: typeof a) => /'nonce-([^']+)'/.exec(r.headers()["content-security-policy"] ?? "")?.[1];
    const na = nonce(a);
    expect(na).toBeTruthy();
    expect(nonce(b)).not.toBe(na);
    const html = await a.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!);
    for (const attrs of scripts.filter((s) => !/type="application\/(ld\+)?json"/.test(s))) expect(attrs).toContain(`nonce="${na}"`);
  });
});

test.describe("§14.3 žádné externí skripty kromě Turnstile a Plausible", () => {
  for (const route of PAGES)
    test(route, async ({ page, baseURL }) => {
      const origin = new URL(baseURL!).host;
      const external: string[] = [];
      page.on("request", (r) => {
        if (r.resourceType() !== "script") return;
        const host = new URL(r.url()).host;
        if (host !== origin && !ALLOWED_SCRIPT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) external.push(r.url());
      });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const srcs = await page.locator("script[src]").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
      for (const s of srcs) {
        const host = new URL(s).host;
        if (host !== origin && !ALLOWED_SCRIPT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) external.push(s);
      }
      expect(external).toEqual([]);
    });

  test("fonty jsou self-hostované (žádné požadavky na fonts.googleapis.com / gstatic)", async ({ page }) => {
    const ext: string[] = [];
    page.on("request", (r) => {
      if (/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/.test(r.url())) ext.push(r.url());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(ext).toEqual([]);
  });
});
