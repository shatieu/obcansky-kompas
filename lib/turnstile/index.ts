/**
 * Cloudflare Turnstile (SPEC §7.1, §14.3). POC používá oficiální testovací klíče (§0.3):
 * site key `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` (vždy projde).
 * Mimo produkci se bez nastavených klíčů použijí testovací.
 */
export const TEST_SITE_KEY = "1x00000000000000000000AA";
export const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const isProd = () => process.env.NODE_ENV === "production" && process.env.POC_MODE !== "1";

export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || (isProd() ? "" : TEST_SITE_KEY);
}

export function turnstileSecret(): string {
  return process.env.TURNSTILE_SECRET_KEY || (isProd() ? "" : TEST_SECRET_KEY);
}

export type TurnstileResult = { ok: true } | { ok: false; reason: "missing-token" | "not-configured" | "rejected" | "network" };

export async function verifyTurnstile(token: unknown, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<TurnstileResult> {
  if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, reason: "missing-token" };
  const secret = turnstileSecret();
  if (!secret) return { ok: false, reason: "not-configured" };
  const body = new URLSearchParams({ secret, response: token });
  try {
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: "rejected" };
  } catch {
    // Testovací klíč vždy projde – bez sítě (offline vývoj) ho pustíme i bez dotazu.
    if (secret === TEST_SECRET_KEY) return { ok: true };
    return { ok: false, reason: "network" };
  }
}
