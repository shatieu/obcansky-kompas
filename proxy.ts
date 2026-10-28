import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, cspEnv, generateNonce } from "@/lib/security/csp";

/**
 * Proxy (dříve middleware) – CSP s nonce pro stránky, které se renderují při každém
 * požadavku (SPEC §14.3). Statické/ISR stránky dostávají statickou CSP z `next.config.ts`,
 * aby zůstaly v CDN cache (§14.2); viz lib/security/csp.ts a DECISIONS.md.
 *
 * Next přečte nonce z hlavičky `Content-Security-Policy` požadavku a přidá ho ke všem
 * svým skriptům; `x-nonce` je pro případné vlastní `<Script nonce>` (zatím žádné).
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp({ ...cspEnv(), nonce });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Musí odpovídat NONCE_ROUTE_PREFIXES v lib/security/csp.ts (hlídá lib/security/csp.test.ts).
export const config = {
  matcher: [
    {
      source: "/kompas/podpis/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/overeni/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/v/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
