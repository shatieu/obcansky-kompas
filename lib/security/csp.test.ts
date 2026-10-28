import { describe, expect, it } from "vitest";
import { config } from "@/proxy";
import {
  API_CSP,
  baseSecurityHeaders,
  buildCsp,
  generateNonce,
  isNonceRoute,
  NONCE_ROUTE_PREFIXES,
  PERMISSIONS_POLICY,
  STATIC_PAGE_SOURCE,
  TURNSTILE_ORIGIN,
} from "./csp";

const directive = (csp: string, name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
    ?.split(/\s+/)
    .slice(1) ?? [];

describe("§14.3 CSP", () => {
  it("nonce varianta: nonce + strict-dynamic, žádné unsafe-inline/unsafe-eval ve skriptech", () => {
    const csp = buildCsp({ nonce: "abc123" });
    const script = directive(csp, "script-src");
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("povoluje jen self + Turnstile; Plausible jen s NEXT_PUBLIC_PLAUSIBLE_DOMAIN", () => {
    const off = buildCsp({});
    expect(directive(off, "script-src")).toContain(TURNSTILE_ORIGIN);
    expect(directive(off, "frame-src")).toEqual([TURNSTILE_ORIGIN]);
    expect(off).not.toContain("plausible");
    const hosts = off.match(/https?:\/\/[^\s;]+/g) ?? [];
    expect(new Set(hosts)).toEqual(new Set([TURNSTILE_ORIGIN]));

    const on = buildCsp({ plausibleDomain: "kompas.example" });
    expect(directive(on, "script-src")).toContain("https://plausible.io");
    expect(directive(on, "connect-src")).toContain("https://plausible.io");
  });

  it("frame-ancestors none, object-src none, base-uri self", () => {
    const csp = buildCsp({ nonce: "x" });
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(API_CSP).toContain("frame-ancestors 'none'");
  });

  it("unsafe-eval jen v dev, upgrade-insecure-requests jen na HTTPS", () => {
    expect(directive(buildCsp({ dev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(buildCsp({})).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ upgradeInsecure: true })).toContain("upgrade-insecure-requests");
  });

  it("nonce je náhodný base64 z 16 B", () => {
    const a = generateNonce();
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(generateNonce()).not.toBe(a);
  });
});

describe("§14.3 ostatní hlavičky", () => {
  it("HSTS, nosniff, Referrer-Policy, Permissions-Policy", () => {
    const h = Object.fromEntries(baseSecurityHeaders().map((x) => [x.key, x.value]));
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    // /fotka používá <input capture>, oprávnění camera nepotřebuje.
    expect(PERMISSIONS_POLICY).toContain("camera=()");
    expect(PERMISSIONS_POLICY).toContain("geolocation=()");
  });
});

describe("stránky s nonce vs. statické stránky", () => {
  const staticRe = new RegExp(`^${STATIC_PAGE_SOURCE}$`);

  it("matcher v proxy.ts odpovídá NONCE_ROUTE_PREFIXES", () => {
    const sources = config.matcher.map((m) => m.source.replace(/\/:path\*$/, ""));
    expect(new Set(sources)).toEqual(new Set(NONCE_ROUTE_PREFIXES));
  });

  it.each(["/", "/kompas", "/statistiky", "/akce", "/fotka", "/metodika", "/kompas/neco", "/vysledky", "/_next/static/x.js"])(
    "%s dostane statickou CSP z next.config (zůstává statická/ISR)",
    (p) => {
      expect(isNonceRoute(p)).toBe(false);
      expect(staticRe.test(p)).toBe(true);
    },
  );

  it.each(["/kompas/podpis", "/kompas/podpis/uprava/abc", "/overeni/tok", "/v/123", "/v/123/zakon"])(
    "%s dostane CSP s nonce z proxy a ne statickou",
    (p) => {
      expect(isNonceRoute(p)).toBe(true);
      expect(staticRe.test(p)).toBe(false);
    },
  );

  it.each(["/api/stats", "/api/sign"])("%s nemá stránkovou CSP (má API_CSP)", (p) => {
    expect(staticRe.test(p)).toBe(false);
  });
});
