import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hmac } from "@/lib/crypto";
import { flags } from "@/lib/env";
import { hit, ipKey } from "@/lib/rate-limit";
import { clientIp } from "@/lib/sign/http";
import { MODERATION_REJECT_MESSAGE } from "./constants";

/** Společné kousky route handlerů /api/demonstrace/*. Žádné osobní údaje v logu ani v chybách. */

export const DEMO_TEXTS = {
  static_demo: "V ukázce se k demonstraci připojit nelze.",
  read_only: "Web je teď jen pro čtení. Zkus to později.",
  unauthorized: "Nejdřív otevři odkaz z e-mailu, kterým jsi ověřil/a podpis.",
  not_eligible: "K demonstraci se může připojit jen ověřený podpis.",
  exists: "V davu už jsi. Svého panáčka můžeš upravit.",
  invalid: "Zkontroluj vyplněné volby.",
  consent: "Bez souhlasu se zveřejněním se připojit nelze.",
  moderation: MODERATION_REJECT_MESSAGE,
  rate_limited: "Moc pokusů za krátkou dobu. Zkus to za hodinu.",
  not_found: "Tohoto účastníka jsme nenašli.",
  unavailable: "Něco se nepovedlo. Zkus to prosím za chvíli.",
  reported: "Díky, podíváme se na to.",
} as const;

export type DemoErrorCode = keyof typeof DEMO_TEXTS;

const NO_STORE = { "cache-control": "private, no-store" };

export function demoJson(body: unknown, status = 200, headers: Record<string, string> = NO_STORE): NextResponse {
  return NextResponse.json(body, { status, headers });
}

export function demoError(code: DemoErrorCode, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return demoJson({ ok: false, error: code, message: DEMO_TEXTS[code], ...extra }, status);
}

/** STATIC_DEMO / READ_ONLY vypnou zápisy (SPEC §14.2, SPEC-demonstrace §9). */
export function demoWriteGate(): NextResponse | null {
  if (flags.staticDemo()) return demoError("static_demo", 403);
  if (flags.readOnly()) return demoError("read_only", 503);
  return null;
}

/** Rate limit připojení a úprav: 10/h na podpis, 20/h na IP (SPEC-demonstrace §3). */
export async function writeLimited(sql: Parameters<typeof hit>[0], req: NextRequest, signatureId: string): Promise<boolean> {
  const bySig = await hit(sql, "demoWritePerSignature", signatureId);
  const byIp = await hit(sql, "demoWritePerIp", ipKey(clientIp(req)));
  return !bySig.allowed || !byIp.allowed;
}

export function demoUnavailable(e: unknown, where: string): NextResponse {
  const code = (e as { code?: string })?.code ?? (e as Error)?.name ?? "unknown";
  console.error(`[demo] ${where} failed code=${String(code).slice(0, 40)}`);
  return demoError("unavailable", 503);
}

export function demoLog(event: string, detail: Record<string, string | number | boolean> = {}): void {
  const parts = Object.entries(detail).map(([k, v]) => `${k}=${v}`);
  console.info(`[demo] ${event}${parts.length ? " " + parts.join(" ") : ""}`);
}

/** `Authorization: Bearer CRON_SECRET` (tak posílá Vercel Cron i CLI skripty). */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** HMAC IP pro nahlášení, vázaný na panáčka – mezi panáčky nepropojitelný, surová IP se neukládá. */
export const reportIpHmac = (id: string, ip: string) => hmac(`demo-report:${id}:${ip.trim().toLowerCase()}`);
