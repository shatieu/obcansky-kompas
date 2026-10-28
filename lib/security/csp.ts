/**
 * Content Security Policy a bezpečnostní hlavičky (SPEC §14.3).
 *
 * Dvě varianty CSP (rozhodnutí v DECISIONS.md „Bezpečnost a výkon“):
 * - **nonce** pro stránky, které se stejně renderují při každém požadavku (podpis, úprava,
 *   ověření, osobní stránka). Nonce generuje `proxy.ts`, Next ho přečte z hlavičky požadavku
 *   a přidá ke všem svým skriptům; `'strict-dynamic'` pak povolí skripty, které načtou
 *   (Turnstile vkládá `components/sign/turnstile.tsx`).
 * - **statická** pro stránky ze CDN (`/`, `/kompas`, `/statistiky`, `/akce`, `/fotka` …):
 *   nonce by vynutil dynamické renderování a zrušil ISR a cache z §14.2. Skripty jen z vlastní
 *   domény + Turnstile (+ Plausible); inline skripty Next (`self.__next_f.push`, data RSC) se
 *   nedají hashovat, protože se u ISR mění s každou revalidací, proto `'unsafe-inline'`
 *   jen pro inline skripty na těchto stránkách. Žádný uživatelský obsah se nevkládá jako HTML.
 *
 * Hlavičky staví čisté funkce, aby šly testovat (lib/security/csp.test.ts).
 */

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const PLAUSIBLE_ORIGIN = "https://plausible.io";

export interface CspOptions {
  /** Nonce pro dynamické stránky; bez něj statická varianta. */
  nonce?: string;
  /** `next dev` potřebuje `'unsafe-eval'` (React debug) a websocket HMR. */
  dev?: boolean;
  /** Doména pro Plausible (NEXT_PUBLIC_PLAUSIBLE_DOMAIN); prázdná = Plausible se nepovolí. */
  plausibleDomain?: string;
  /** `upgrade-insecure-requests` jen tam, kde web běží na HTTPS (Vercel). */
  upgradeInsecure?: boolean;
}

export function buildCsp(o: CspOptions = {}): string {
  const plausible = o.plausibleDomain?.trim() ? [PLAUSIBLE_ORIGIN] : [];
  const script = ["'self'"];
  if (o.nonce) script.push(`'nonce-${o.nonce}'`, "'strict-dynamic'");
  else script.push("'unsafe-inline'");
  // HEIC dekodér (heic-to/csp) kompiluje WebAssembly; 'wasm-unsafe-eval' nepovolí eval JS.
  script.push("'wasm-unsafe-eval'", TURNSTILE_ORIGIN, ...plausible);
  if (o.dev) script.push("'unsafe-eval'");

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", script],
    // React vykresluje atributy style="…" (posuvník, grafy) a Next vkládá <style> fontů –
    // atributy stylu nonce mít nemůžou, proto 'unsafe-inline' jen u stylů.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...plausible, ...(o.dev ? ["ws:", "wss:"] : [])]],
    ["frame-src", [TURNSTILE_ORIGIN]],
    // Dekodér HEIC běží ve workeru z blob: URL.
    ["worker-src", ["'self'", "blob:"]],
    ["media-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const parts = directives.map(([k, v]) => `${k} ${v.join(" ")}`);
  if (o.upgradeInsecure) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** CSP pro odpovědi API (JSON, CSV, soubory): nic se nemá spouštět ani vkládat do rámů. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * Permissions-Policy: aplikace nepotřebuje žádné citlivé API. `/fotka` používá
 * `<input type="file" capture>`, který otevře systémový fotoaparát bez oprávnění `camera`
 * (oprávnění by bylo potřeba jen pro getUserMedia), takže kamera je vypnutá všude.
 */
export const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "hid=()",
  "bluetooth=()",
  "midi=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "display-capture=()",
  "browsing-topics=()",
  "interest-cohort=()",
].join(", ");

/** Hlavičky společné všem odpovědím (CSP se přidává zvlášť podle typu stránky). */
export function baseSecurityHeaders(): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/**
 * Stránky s nonce (renderují se při každém požadavku). Musí odpovídat `config.matcher`
 * v `proxy.ts` (matcher musí být literál, proto je seznam i tam; hlídá test).
 * Pozor: stránka s nonce **nesmí** být staticky/ISR cachovaná, jinak by cache poslala HTML
 * s cizím nonce a prohlížeč by skripty zablokoval.
 */
export const NONCE_ROUTE_PREFIXES = ["/kompas/podpis", "/overeni", "/v"] as const;

/**
 * Zdroj pravidla `headers()` pro statickou CSP: všechno kromě API a stránek s nonce.
 * Hlídá test (lib/security/csp.test.ts), že sedí s NONCE_ROUTE_PREFIXES.
 */
export const STATIC_PAGE_SOURCE = "/((?!api(?:/|$)|kompas/podpis(?:/|$)|overeni(?:/|$)|v(?:/|$)).*)";

export function isNonceRoute(pathname: string): boolean {
  return NONCE_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** 16 B náhody jako base64 (Web Crypto – běží v proxy i v Node). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function cspEnv(): Omit<CspOptions, "nonce"> {
  return {
    dev: process.env.NODE_ENV === "development",
    plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
    upgradeInsecure: process.env.VERCEL === "1",
  };
}
