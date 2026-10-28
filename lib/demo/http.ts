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
  owner_conflict: "V tomhle prohlížeči je k demonstraci přihlášený jiný podpis.",
  turnstile: "Ochrana proti robotům tě nepustila. Načti stránku a zkus to znovu.",
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

/**
 * Klíč „jednoho účastníka sítě“ pro nahlášení: IPv4 celá adresa (i zapsaná jako ::ffff:a.b.c.d),
 * IPv6 jen prefix /64 – jedna přípojka/VPS má obvykle celou /64, takže rotace adres uvnitř ní
 * se nepočítá jako „různé IP“ (SPEC-demonstrace §4.3). Neparsovatelná hodnota zůstane, jak je.
 */
export function ipNetworkKey(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v4 = /^(?:::ffff:(?:0{1,4}:)?)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (v4) return v4[1]!;
  if (!ip.includes(":")) return ip;
  let s = ip;
  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
    s = s.slice(0, tail.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return ip;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;
  const groups = rest ? [...head, ...Array<string>(Math.max(0, 8 - head.length - rest.length)).fill("0"), ...rest] : head;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}

/**
 * HMAC sítě (ipNetworkKey) pro nahlášení, vázaný na panáčka – mezi panáčky nepropojitelný,
 * surová IP se neukládá. Unikátní (panáček, ip_hmac) = počítají se jen různé sítě.
 */
export const reportIpHmac = (id: string, ip: string) => hmac(`demo-report:${id}:${ipNetworkKey(ip)}`);
