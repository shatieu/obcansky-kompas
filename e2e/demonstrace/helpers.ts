/**
 * Pomůcky pro e2e online demonstrace (SPEC-demonstrace §11). Texty z content/ui.yaml
 * (serverové sekce `demonstrace` a `demonstrace_crowd`), aby testy nezávisely na opsaných řetězcích.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { parse } from "yaml";
import { randomIp, ROOT, ui } from "../acceptance/helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const dt = ui.demonstrace as any;
export const ct = ui.demonstrace_crowd as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const demoSlogans = parse(readFileSync(path.join(ROOT, "content", "demonstrace", "slogans.yaml"), "utf8")) as {
  default: string;
  presets: { id: string; text: string }[];
};
export const presetText = (id: string) => demoSlogans.presets.find((p) => p.id === id)!.text;

/** Hláška skriptové moderace – doslova SPEC-demonstrace §4.1. */
export const MODERATION_MESSAGE = "Tento text nelze použít. Zkuste jiný.";

/** Běh proti nasazené verzi (PLAYWRIGHT_BASE_URL) – bez CLI, X-Forwarded-For nastavuje platforma. */
export const external = Boolean(process.env.PLAYWRIGHT_BASE_URL || process.env.E2E_BASE_URL);

/** CRON_SECRET lokálního e2e serveru (playwright.config.ts). */
export const e2eCronSecret = createHash("sha256").update("obcansky-kompas:e2e-only:cron").digest("base64");

export type TileItem = [number, number, string, string, string, string | null, string, string];

/** Neutrální slova (ověřená skriptovou moderací, viz uniqueText). */
const WORDS = ["lipa", "kniha", "rano", "most", "reka", "pole", "vlak", "hora", "ovce", "dub", "les", "zahrada", "okno", "chleba", "mlyn", "jaro"];

/** Unikátní, moderací procházející text: předpona + tři náhodná neutrální slova (bez číslic – leetspeak). */
export function uniqueText(prefix: string): string {
  const w = () => WORDS[Math.floor(Math.random() * WORDS.length)]!;
  return `${prefix} ${w()} ${w()} ${w()}`;
}

export const uniqueEmail = (tag: string) => `e2e.demo.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;

/**
 * Podpis přes API (Turnstile testovacím tokenem) + POC ověření v prohlížeči. Vrátí uuid podpisu.
 * Ověření nastaví httpOnly cookie vlastníka `ok_owner` (DECISIONS: doklad vlastnictví).
 */
export async function signAndVerify(page: Page, name = "Demo Tester"): Promise<string> {
  const res = await page.request.post("/api/sign", {
    headers: { "x-forwarded-for": randomIp() },
    data: { name, email: uniqueEmail("api"), consent: true, answers: { q1: 8.5, q2: "q2-opt1" }, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" },
  });
  expect(res.status(), await res.text()).toBe(202);
  const { verifyUrl } = (await res.json()) as { verifyUrl?: string };
  expect(verifyUrl, "POC režim vrací odkaz pro ověření").toBeTruthy();
  await page.goto(new URL(verifyUrl!).pathname);
  await page.waitForURL(/\/v\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expectOwnerCookie(page);
  return /\/v\/([0-9a-f-]{36})/.exec(page.url())![1]!;
}

export async function expectOwnerCookie(page: Page) {
  const c = (await page.context().cookies()).find((x) => x.name === "ok_owner");
  expect(c, "cookie ok_owner po ověření").toBeTruthy();
  expect(c!.httpOnly).toBe(true);
}

export interface JoinBody {
  sloganPresetId?: string;
  sloganCustom?: string;
  pose?: string;
  signColor?: string;
  firstName?: string | null;
}

/** Připojení přes API s cookie vlastníka z kontextu stránky. Vrátí { id, index }. */
export async function apiJoin(page: Page, body: JoinBody): Promise<{ id: string; index: number }> {
  const data = {
    ...(body.sloganCustom ? { sloganCustom: body.sloganCustom } : { sloganPresetId: body.sloganPresetId ?? demoSlogans.presets[0]!.id }),
    pose: body.pose ?? "drzi",
    signColor: body.signColor ?? "white",
    seed: Math.floor(Math.random() * 2 ** 32),
    rerollCount: 0,
    firstName: body.firstName ?? null,
    consent: true,
  };
  const res = await page.request.post("/api/demonstrace/join", { headers: { "x-forwarded-for": randomIp() }, data });
  expect(res.status(), await res.text()).toBe(201);
  const j = (await res.json()) as { id: string; index: number; pending: boolean };
  return { id: j.id, index: j.index };
}

/**
 * Nahlášení z dané IP (lokálně X-Forwarded-For = IP klienta). Posílá i testovací token Turnstile:
 * IN-FLIGHT (2026-10-28) – Turnstile u nahlášení a sdružování IPv6 na /64 se teprve přidává;
 * commit 03d2435 tělo požadavku ignoruje, nová verze testovací token přijme (testovací klíče v e2e).
 */
export async function report(request: APIRequestContext, id: string, ip = randomIp()) {
  const res = await request.post(`/api/demonstrace/${id}/report`, {
    headers: { "x-forwarded-for": ip },
    data: { turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" },
  });
  expect(res.status(), await res.text()).toBe(202);
}

/** Dlaždice obsahující index; na produkci s parametrem proti CDN cache. */
export async function tileItem(request: APIRequestContext, id: string, index: number): Promise<TileItem | undefined> {
  const n = Math.floor(index / 1000);
  const res = await request.get(`/api/demonstrace/tile/${n}${external ? `?e2e=${Date.now()}` : ""}`);
  expect(res.status()).toBe(200);
  const tile = (await res.json()) as { items: TileItem[] };
  return tile.items.find((it) => it[6] === id);
}

/** Všechny položky davu (všechny dlaždice podle meta). */
export async function allTileItems(request: APIRequestContext): Promise<TileItem[]> {
  const bust = external ? `?e2e=${Date.now()}` : "";
  const meta = (await (await request.get(`/api/demonstrace/meta${bust}`)).json()) as { tiles: number };
  const out: TileItem[] = [];
  for (let n = 0; n < meta.tiles; n++) {
    const res = await request.get(`/api/demonstrace/tile/${n}${bust}`);
    expect(res.status()).toBe(200);
    out.push(...((await res.json()) as { items: TileItem[] }).items);
  }
  return out;
}
