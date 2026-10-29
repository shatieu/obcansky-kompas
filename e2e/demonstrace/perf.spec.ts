/**
 * Výkon davu (SPEC-demonstrace §6.3, §11): fps na /demonstrace s 50 000 účastníky v desktopovém
 * profilu při několika pozicích kamery (~5 s každá) a celkový JS stránky včetně líně načtených
 * chunků PixiJS (rozpočet 250 kB gzip). Výsledek jde do HANDOFF.md (ručně, z výstupu testu).
 *
 * Spouští se jen s E2E_PERF=1 proti serveru se seedem:
 *   PGLITE_PORT=<e2e pglite port> pnpm seed:demonstrace --count 50000
 *   E2E_PERF=1 pnpm e2e e2e/demonstrace/perf.spec.ts --project desktop-1280
 * `E2E_PERF_HEADED=1` = okno s hardwarovou GPU (headless Chromium kreslí přes SwiftShader).
 */
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { crowdBounds, positionFor } from "../../lib/crowd/layout";

test.skip(process.env.E2E_PERF !== "1", "výkonový test jen s E2E_PERF=1 (potřebuje seed 50 000)");
test.use({
  headless: process.env.E2E_PERF_HEADED !== "1",
  launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] },
});

const BUDGET = 250 * 1024;
const MIN_COUNT = Number(process.env.E2E_PERF_MIN_COUNT ?? 50_000);
const SAMPLE_MS = 5_000;

interface Stats {
  fps: number;
  animated: number;
  visible: number;
  count: number;
  renderer: string;
  tiles: number;
}

/** Kamera na postavu s indexem tak, aby postava měla na obrazovce ~`px` px (LOD podle výšky). */
function cam(index: number, px: number) {
  const p = positionFor(index);
  const z = px / (100 * p.scale);
  return { x: Math.round(p.x), y: Math.round(p.y - 50 * p.scale), z: Math.round(z * 1000) / 1000 };
}

function wholeCrowd() {
  const b = crowdBounds(MIN_COUNT);
  return { x: Math.round((b.x0 + b.x1) / 2), y: Math.round((b.y0 + b.y1) / 2), z: 0.004 };
}

const VIEWS = [
  { name: "blízko vepředu (plná animace + text cedulí)", camera: cam(0, 160) },
  { name: "středně (animace bez textu)", camera: cam(3_000, 70) },
  { name: "daleko (statické siluety)", camera: cam(20_000, 22) },
  // z mimo rozsah se ořízne na pohled na celý dav (clampCamera)
  { name: "celý dav (tečky)", camera: wholeCrowd() },
];

async function waitReady(page: Page) {
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __crowdStats?: Stats }).__crowdStats?.count ?? 0), { timeout: 60_000 }).toBeGreaterThanOrEqual(MIN_COUNT);
  await expect(page.getByText(/Načítám dav/)).toHaveCount(0);
}

/** Snímky za `ms` přes requestAnimationFrame: průměrné fps, 5. percentil fps (1/p95 délky snímku). */
async function sampleFps(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ fps: number; p5: number; frames: number; maxFrameMs: number }>((resolve) => {
        const times: number[] = [];
        let last = 0;
        let t0 = 0;
        const step = (t: number) => {
          if (!t0) t0 = t;
          if (last) times.push(t - last);
          last = t;
          if (t - t0 < ms) requestAnimationFrame(step);
          else {
            const sorted = [...times].sort((a, b) => a - b);
            const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
            resolve({ fps: (times.length * 1000) / (t - t0), p5: p95 ? 1000 / p95 : 0, frames: times.length, maxFrameMs: sorted[sorted.length - 1] ?? 0 });
          }
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

type Row = { view: string; camera: { x: number; y: number; z: number }; fps: number; p5: number; maxFrameMs: number; crowdFps: number; visible: number; animated: number; count: number; renderer: string };

/** fps v pohledech VIEWS: zahřátí 2,5 s, pak SAMPLE_MS měření přes requestAnimationFrame. */
async function measureViews(page: Page): Promise<Row[]> {
  const rows: Row[] = [];
  for (const v of VIEWS) {
    await page.goto(`/demonstrace?debug=1&x=${v.camera.x}&y=${v.camera.y}&z=${v.camera.z}`);
    await waitReady(page);
    await page.waitForTimeout(2_500); // zahřátí: dlaždice, textury cedulí
    const s = await sampleFps(page, SAMPLE_MS);
    const st = (await page.evaluate(() => (window as unknown as { __crowdStats?: Stats }).__crowdStats))!;
    rows.push({ view: v.name, camera: v.camera, fps: Math.round(s.fps * 10) / 10, p5: Math.round(s.p5 * 10) / 10, maxFrameMs: Math.round(s.maxFrameMs), crowdFps: st.fps, visible: st.visible, animated: st.animated, count: st.count, renderer: st.renderer });
  }
  return rows;
}

test("výkon davu: fps při 50 000 účastnících a JS stránky", async ({ page, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "SPEC-demonstrace §11: desktopový profil");
  test.setTimeout(240_000);

  // ---- JS stránky včetně líných chunků (PixiJS, engine) ----
  const scripts = new Map<string, Promise<number>>();
  page.on("response", (res) => {
    if (res.request().resourceType() !== "script" || scripts.has(res.url())) return;
    scripts.set(
      res.url(),
      res.body().then(
        (b) => gzipSync(b, { level: 9 }).length,
        () => 0,
      ),
    );
  });
  await page.goto("/demonstrace?debug=1");
  await waitReady(page);
  await page.waitForTimeout(2_000);
  const sizes = await Promise.all([...scripts.entries()].map(async ([u, p]) => [new URL(u).pathname, await p] as const));
  const jsPage = sizes.reduce((s, [, n]) => s + n, 0);

  // Karta (líně při prvním klepnutí): Enter otevře kartu panáčka uprostřed výřezu.
  await page.getByRole("application").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2_000);
  const sizesCard = await Promise.all([...scripts.entries()].map(async ([u, p]) => [new URL(u).pathname, await p] as const));
  const jsWithCard = sizesCard.reduce((s, [, n]) => s + n, 0);

  // /demonstrace/[id] přímo (karta se otevírá při načtení): nový kontext = prázdná cache.
  const tile0 = (await (await page.request.get("/api/demonstrace/tile/0")).json()) as { items: [number, number, string, string, string, string | null, string][] };
  const someIndex = tile0.items[Math.floor(tile0.items.length / 2)]![0];
  const someId = ((await (await page.request.get(`/api/demonstrace/at/${someIndex}`)).json()) as { id: string }).id;
  const ctx2 = await page.context().browser()!.newContext({ baseURL: testInfo.project.use.baseURL, viewport: page.viewportSize()! });
  const p2 = await ctx2.newPage();
  const scripts2 = new Map<string, Promise<number>>();
  p2.on("response", (res) => {
    if (res.request().resourceType() !== "script" || scripts2.has(res.url())) return;
    scripts2.set(
      res.url(),
      res.body().then(
        (b) => gzipSync(b, { level: 9 }).length,
        () => 0,
      ),
    );
  });
  await p2.goto(`/demonstrace/${someId}`);
  await expect(p2.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
  await p2.waitForTimeout(3_000);
  const jsIdPage = (await Promise.all(scripts2.values())).reduce((s, n) => s + n, 0);
  await ctx2.close();

  const gpu = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return "bez WebGL";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });

  const rows = await measureViews(page);

  const result = {
    date: new Date().toISOString(),
    browser: `${browserName} ${page.context().browser()?.version()}`,
    headless: process.env.E2E_PERF_HEADED !== "1",
    gpu,
    viewport: page.viewportSize(),
    count: rows[0]?.count,
    jsPageKb: Math.round(jsPage / 102.4) / 10,
    jsWithCardKb: Math.round(jsWithCard / 102.4) / 10,
    jsIdPageKb: Math.round(jsIdPage / 102.4) / 10,
    scripts: sizesCard.map(([p, n]) => ({ path: p, kb: Math.round(n / 102.4) / 10 })).sort((a, b) => b.kb - a.kb),
    views: rows,
  };
  console.log(JSON.stringify({ ...result, scripts: undefined }, null, 2));
  writeFileSync(testInfo.outputPath("crowd-perf.json"), JSON.stringify(result, null, 2));
  await testInfo.attach("crowd-perf.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });

  expect(jsPage, "JS /demonstrace včetně PixiJS ≤ 250 kB gzip").toBeLessThanOrEqual(BUDGET);
  expect(jsIdPage, "JS /demonstrace/[id] včetně PixiJS a karty ≤ 250 kB gzip").toBeLessThanOrEqual(BUDGET);
  for (const r of rows) expect(r.fps, r.view).toBeGreaterThan(0);
});

/**
 * Hrubá náhrada středního Androidu (NE skutečné zařízení): mobilní profil 360×780 s dotykem
 * (strop 300 animovaných postav) a CPU zpomalené 4× přes CDP. GPU zůstává desktopová.
 */
test("výkon davu: mobilní profil se 4× zpomaleným CPU (odhad)", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "jeden běh stačí");
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const rows = await measureViews(page);
  const result = { date: new Date().toISOString(), profile: "360×780 DPR 2, touch, CPU 4× throttle", views: rows };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync(testInfo.outputPath("crowd-perf-mobile.json"), JSON.stringify(result, null, 2));
  await ctx.close();
  for (const r of rows) expect(r.fps, r.view).toBeGreaterThan(0);
});
