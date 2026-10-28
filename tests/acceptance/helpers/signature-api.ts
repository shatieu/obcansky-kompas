/**
 * ADAPTÉR na API podpisu (SPEC §7, §14.2, §14.3). SPEC neurčuje cesty route handlerů ani tvar
 * těla požadavku – tady je jediné místo, kde se akceptační testy na tyto detaily váží.
 * Když implementace zvolí jinou cestu nebo jiné názvy polí, uprav JEN tento soubor.
 *
 * Testy volají route handlery přímo (export POST/GET z app/api/.../route.ts) s NextRequest.
 */
import { NextRequest } from "next/server";
import { CONTENT_VERSION } from "@/lib/content";
import { firstExisting, importFile } from "./runtime";

export const ROUTE_CANDIDATES = {
  sign: ["app/api/sign/route.ts", "app/api/signature/route.ts", "app/api/signatures/route.ts", "app/api/podpis/route.ts", "app/api/podpisy/route.ts"],
  verify: ["app/api/verify/route.ts", "app/api/overeni/route.ts", "app/api/sign/verify/route.ts", "app/api/signature/verify/route.ts"],
  editLink: [
    "app/api/edit-link/route.ts",
    "app/api/sign/edit-link/route.ts",
    "app/api/signature/edit-link/route.ts",
    "app/api/odkaz/route.ts",
    "app/api/edit/request/route.ts",
  ],
  withdraw: ["app/api/withdraw/route.ts", "app/api/sign/withdraw/route.ts", "app/api/signature/withdraw/route.ts", "app/api/odvolani/route.ts"],
  event: ["app/api/event/route.ts", "app/api/events/route.ts", "app/api/udalost/route.ts", "app/api/udalosti/route.ts"],
} as const;

export type RouteKind = keyof typeof ROUTE_CANDIDATES;
export const routeFile = (kind: RouteKind) => firstExisting([...ROUTE_CANDIDATES[kind]]);

type Handler = (req: NextRequest, ctx?: unknown) => Promise<Response> | Response;
type RouteModule = { POST?: Handler; GET?: Handler; DELETE?: Handler; PATCH?: Handler };

export interface ApiResult {
  status: number;
  text: string;
  json: unknown;
  headers: Headers;
}

const g = globalThis as { __accRequestHeaders?: Headers };

/** Hlavičky aktuálního požadavku pro mock `next/headers` v testech. */
export function currentRequestHeaders(): Headers {
  return g.__accRequestHeaders ?? new Headers();
}

export async function call(kind: RouteKind, method: "POST" | "GET" | "DELETE" | "PATCH", body: unknown, opts: { ip?: string; query?: string } = {}): Promise<ApiResult> {
  const file = routeFile(kind);
  if (!file) throw new Error(`route ${kind} neexistuje (kandidáti: ${ROUTE_CANDIDATES[kind].join(", ")})`);
  const mod = (await importFile<RouteModule>(file))!;
  const handler = mod[method];
  if (!handler) throw new Error(`${file} nemá export ${method}`);
  const ip = opts.ip ?? "198.51.100.1";
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": ip,
    "x-real-ip": ip,
    "cf-connecting-ip": ip,
    "user-agent": "acceptance-test",
    origin: "http://localhost:3000",
  });
  g.__accRequestHeaders = headers;
  const url = `http://localhost:3000/${file.replace(/\\/g, "/").replace(/^.*?app\//, "").replace(/\/route\.ts$/, "")}${opts.query ?? ""}`;
  const req = new NextRequest(url, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body) });
  const res = await handler(req, { params: Promise.resolve({}) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* není JSON */
  }
  return { status: res.status, text, json, headers: res.headers };
}

export const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

export interface SignInput {
  name: string;
  email: string;
  answers: Record<string, unknown>;
  showName?: boolean;
  address?: string;
  consent?: boolean;
  comment?: string;
  region?: string;
  ageGroup?: string;
  municipalitySize?: string;
}

/** Tělo požadavku na podpis podle polí ze SPEC §7.1 (+ běžné alternativní názvy). */
export function signBody(i: SignInput): Record<string, unknown> {
  const consent = i.consent ?? true;
  return {
    name: i.name,
    email: i.email,
    showName: i.showName ?? false,
    address: i.address,
    consent,
    consentPolitical: consent,
    answers: i.answers,
    contentVersion: CONTENT_VERSION,
    demographics: { region: i.region, ageGroup: i.ageGroup, municipalitySize: i.municipalitySize, comment: i.comment },
    region: i.region,
    ageGroup: i.ageGroup,
    municipalitySize: i.municipalitySize,
    comment: i.comment,
    turnstileToken: TURNSTILE_TEST_TOKEN,
    "cf-turnstile-response": TURNSTILE_TEST_TOKEN,
  };
}

export const sign = (i: SignInput, ip?: string) => call("sign", "POST", signBody(i), { ip });

/** Ověřovací token z odpovědi (POC režim ukazuje odkaz /overeni/<token> přímo, SPEC §0.3). */
export function extractVerifyToken(text: string): string | null {
  const m = /\/overeni\/([A-Za-z0-9_\-.~%]+)/.exec(text);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** Token pro úpravu/odvolání z odpovědi na žádost o odkaz (POC: odkaz na obrazovce). */
export function extractEditToken(text: string): string | null {
  const m = /(?:[?&]token=|\/(?:uprava|upravit|edit|odkaz|zmena|odvolat|sprava)\/)([A-Za-z0-9_\-.~%]{16,})/.exec(text);
  return m ? decodeURIComponent(m[1]!) : null;
}

export async function verify(token: string): Promise<ApiResult> {
  const r = await call("verify", "POST", { token });
  if (r.status !== 405) return r;
  return call("verify", "GET", null, { query: `?token=${encodeURIComponent(token)}` });
}

/** Zamaskuje UUID a tokeny, aby šly porovnat odpovědi (SPEC §7.2: stejná odpověď). */
export function normaliseResponse(text: string): string {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\/overeni\/[A-Za-z0-9_\-.~%]+/g, "/overeni/<token>")
    .replace(/[A-Za-z0-9_-]{32,}/g, "<token>")
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "<time>");
}
