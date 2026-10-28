import type { NextRequest } from "next/server";
import { flags } from "@/lib/env";
import { signTexts } from "./texts";

/** Společné kousky route handlerů podpisu. Žádné osobní údaje v logu ani v chybách. */

export const VERIFY_TTL_MS = 7 * 24 * 3600 * 1000;
export const EDIT_TTL_MS = 24 * 3600 * 1000;

export function siteUrl(req?: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (env) return env;
  return req ? req.nextUrl.origin : "http://localhost:3000";
}

export const verifyUrl = (base: string, token: string) => `${base}/overeni/${token}`;
export const editUrl = (base: string, token: string) => `${base}/kompas/podpis/uprava/${token}`;
export const signaturePath = (id: string) => `/v/${id}`;

/** IP klienta – použije se jen pro HMAC rate limitu, nikdy se neukládá ani neloguje. */
export function clientIp(req: NextRequest): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return h.get("cf-connecting-ip") || h.get("x-real-ip") || fwd || "unknown";
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export type ErrorCode =
  | "static_demo"
  | "read_only"
  | "invalid"
  | "disposable"
  | "turnstile"
  | "rate_limited"
  | "unavailable"
  | "not_found"
  | "expired"
  | "used"
  | "unauthorized";

export function error(code: ErrorCode, status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error: code, message, ...extra }, status);
}

/** STATIC_DEMO / READ_ONLY vypnou všechny zápisy (SPEC §14.2, §16 A). */
export function writeGate(): Response | null {
  const t = signTexts();
  if (flags.staticDemo()) return error("static_demo", 403, t.sign.static_demo);
  if (flags.readOnly()) return error("read_only", 503, t.sign.read_only);
  return null;
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Log bez osobních údajů: jen událost a krátký kód chyby. */
export function logEvent(event: string, detail: Record<string, string | number | boolean> = {}): void {
  const parts = Object.entries(detail).map(([k, v]) => `${k}=${v}`);
  console.info(`[sign] ${event}${parts.length ? " " + parts.join(" ") : ""}`);
}

/** Chyba DB → 503 „zkus to za chvíli“; do logu jen kód chyby. */
export function unavailable(e: unknown, where: string): Response {
  const code = (e as { code?: string })?.code ?? (e as Error)?.name ?? "unknown";
  console.error(`[sign] ${where} failed code=${String(code).slice(0, 40)}`);
  return error("unavailable", 503, signTexts().sign.unavailable);
}
