/**
 * Pomůcky pro akceptační e2e testy. Viditelné texty se čtou z content/*.yaml za běhu,
 * aby testy nezávisely na natvrdo opsaných řetězcích.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";
import { parse } from "yaml";

export const ROOT = process.cwd();
const y = <T>(rel: string): T => parse(readFileSync(path.join(ROOT, "content", rel), "utf8")) as T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ui = y<any>("ui.yaml");
export const stance = y<{ title: string; text: string; actions: { label: string; href: string }[] }>("stance.yaml");
export const questions = y<{
  questions: { id: string; type: string; text: string; options: { id: string; label: string; nevim?: boolean }[] }[];
}>("questions.yaml");
export const sentences = y<{ intro: { text: string }; options: Record<string, { text?: string }> }>("sentences.yaml");
export const lawBase = y<{ labels: { working_draft: string; disclaimer: string } }>("law/base.yaml");
export const slogans = y<{ slogans: { id: string; text: string }[] }>("slogans.yaml");
export const letterLabel = (type: string) => y<{ label: string }>(`letters/${type}.yaml`).label;

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Část šablony před prvním zástupným symbolem {x}. */
export const templatePrefix = (tpl: string) => tpl.split("{")[0]!.trim();

export const q = (id: string) => questions.questions.find((x) => x.id === id)!;
export const optionId = (qid: string, label: string) => q(qid).options.find((o) => o.label === label)!.id;

export const SPEC_ROUTES_STATIC = [
  "/",
  "/kompas",
  "/kompas/podpis",
  "/akce",
  "/fotka",
  "/statistiky",
  "/hnuti",
  "/metodika",
  "/metodika/zdroje",
  "/o-projektu",
  "/soukromi",
];

/** UUID ověřeného ukázkového podpisu (seed je v DEMO/POC DB, SPEC §15 m4). Lze přepsat E2E_SIGNATURE_UUID. */
export async function demoSignatureId(): Promise<string> {
  if (process.env.E2E_SIGNATURE_UUID) return process.env.E2E_SIGNATURE_UUID;
  const { generateSeed } = await import("../../lib/seed/generate");
  const { facts, questionsFile } = await import("../../lib/content");
  const s = generateSeed(questionsFile, facts).signatures.find((x) => x.verified)!;
  return s.id;
}

/** Náhodná IP do X-Forwarded-For, aby e2e běhy nenarážely na rate limit 5/h na IP (SPEC §14.3). */
export function randomIp(): string {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
}

/** Nadpis aktuálního kroku kompasu (h1). */
export async function currentHeading(page: Page): Promise<string> {
  const h = page.locator("main h1").first();
  await expect(h).toBeVisible();
  return (await h.innerText()).trim();
}

export async function clickNext(page: Page) {
  await page.getByRole("button", { name: ui.compass.next_button, exact: true }).click();
}

export type Choices = Partial<Record<string, string | string[] | "slider+">>;

/**
 * Projde kompas od aktuální obrazovky po souhrn. U každé otázky zvolí podle `choices`
 * (popisek volby ze SPEC; u Q1 "slider+" = jednou tlačítko +), odpadlé otázky přeskočí.
 */
export async function answerCompass(page: Page, choices: Choices) {
  for (let guard = 0; guard < 14; guard++) {
    const heading = await currentHeading(page);
    if (heading === ui.compass.summary_title) return;
    if (heading === ui.demographics.title) {
      await page.getByRole("button", { name: ui.compass.finish_button, exact: true }).click();
      continue;
    }
    const question = questions.questions.find((x) => x.text === heading);
    if (!question) throw new Error(`neznámá obrazovka kompasu: „${heading}“`);
    const choice = choices[question.id];
    if (choice === "slider+") await page.getByRole("button", { name: ui.slider.increase_aria }).click();
    else if (choice) {
      const role = question.type === "multi" ? "checkbox" : "radio";
      for (const label of Array.isArray(choice) ? choice : [choice]) {
        const opt = page.getByRole(role, { name: label, exact: true });
        if ((await opt.count()) && (await opt.getAttribute("aria-checked")) !== "true") await opt.click();
      }
    }
    await clickNext(page);
    await expect.poll(() => currentHeading(page)).not.toBe(heading);
  }
  throw new Error("kompas se nepodařilo dokončit");
}

export const JOURNEY: Choices = {
  q1: "slider+",
  q2: "Poplatek jako dnes",
  q3: "Nezávislá komise na několik let",
  q4: "Každá domácnost",
  q5: "Stejně, ale se slevami",
  q6: "Ano, méně",
  q7: ["Studenti", "Lidé se zdravotním postižením"],
  q8: "Jen velké firmy",
};

/* ------------------------------------------------------------- PNG pro /fotka */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** Jednoduché RGB PNG (modro-bílé pruhy) bez závislostí. */
export function makePng(w = 640, h = 480): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let yy = 0; yy < h; yy++) {
    raw[yy * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = yy * (w * 3 + 1) + 1 + x * 3;
      const blue = (x >> 5) % 2 === 0;
      raw[o] = blue ? 0x11 : 0xff;
      raw[o + 1] = blue ? 0x45 : 0xff;
      raw[o + 2] = blue ? 0x7e : 0xff;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Rozměry PNG/JPEG z bajtů (bez závislostí). */
export function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Bajty vypadají jako obrázek (PNG/JPEG/HEIC/WebP), i v base64. */
export function looksLikeImage(body: Buffer | null): boolean {
  if (!body || body.length < 8) return false;
  const s = body.toString("latin1");
  return (
    s.includes("\x89PNG") ||
    s.includes("\xff\xd8\xff") ||
    s.includes("ftypheic") ||
    s.includes("WEBPVP8") ||
    /iVBORw0KGgo|\/9j\/4|data:image\//.test(s)
  );
}
