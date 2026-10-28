import type { NextConfig } from "next";
import { API_CSP, baseSecurityHeaders, buildCsp, cspEnv, STATIC_PAGE_SOURCE } from "./lib/security/csp";

/**
 * Bezpečnostní hlavičky (SPEC §14.3). Statická CSP jde se statickými/ISR stránkami přímo
 * z CDN; stránky s nonce (podpis, úprava, ověření, osobní stránka) dostávají CSP z `proxy.ts`
 * a tady jsou z pravidla pro stránky vyloučené, aby nevznikly dvě CSP hlavičky.
 * Hodnoty se vyhodnotí při buildu (NEXT_PUBLIC_PLAUSIBLE_DOMAIN je stejně build-time).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  // Build kontroluje typy jen kódu aplikace; testy a skripty hlídá `pnpm typecheck`.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // Vlastní výstupní složka pro paralelní lokální buildy/ověřování (výchozí .next).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Stránky čtoucí YAML za běhu (readFileSync) – soubory musí jít do serverless bundlu.
  outputFileTracingIncludes: {
    "/hnuti": ["./content/*.yaml"],
    "/org/[token]": ["./content/*.yaml"],
    "/api/org/submit": ["./content/*.yaml"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders() },
      { source: STATIC_PAGE_SOURCE, headers: [{ key: "Content-Security-Policy", value: buildCsp(cspEnv()) }] },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
  },
};

export default nextConfig;
