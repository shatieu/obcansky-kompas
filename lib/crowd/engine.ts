/**
 * Dav v PixiJS v8 (SPEC-demonstrace §6). Jen prohlížeč – importuje se dynamicky z komponenty
 * davu, aby se PixiJS stahoval jen na stránkách /demonstrace*.
 *
 * Vrstvy (zezadu): dlažba a pódium → tečky (celý dav) → statické siluety (ParticleContainer)
 * → postavy ze spritů (animované, s textem cedule zblízka), seřazené podle hloubky.
 */
import "pixi.js/unsafe-eval";
import {
  autoDetectRenderer,
  CanvasParticleContainerPipe,
  CanvasSource,
  Container,
  extensions,
  GlParticleContainerPipe,
  Particle,
  ParticleContainer,
  Rectangle,
  Sprite,
  Texture,
  type Renderer,
} from "pixi.js";
import type { SignColor } from "@/lib/demo/constants";
import { figureGeometry, STROKE, type Figure } from "@/lib/stickman/geometry";
import { generateStickman, type StickmanParams } from "@/lib/stickman/params";
import { poseAt } from "@/lib/stickman/poses";
import { layoutSignText, SIGN_FONT_WEIGHT, type StickmanPalette } from "@/lib/stickman/sign";
import { ATLAS_H, ATLAS_W, atlasLayout, drawAtlas, headKey, PART_RES, signKey, SIL_RES, silKey, type AtlasLayout, type Frame } from "./atlas";
import { clampCamera, screenToWorld, viewRect, zoomAt, type Camera, type Viewport } from "./camera";
import { sloganText, type CrowdPerson, type CrowdSource } from "./data";
import { crowdBounds, forEachInRect, hitTest, LAYOUT, nearestIndex, positionFor, rowOf, rowScale, rowStart, rowY, STAGE, type Rect } from "./layout";
import { animatedCap, figurePx, LOD_PX, lodFor, selectAnimated } from "./lod";
import { tilesForRect } from "./tiles";

// Jen WebGL a canvas (WebGPU nepoužíváme) – menší balík než `pixi.js/particle-container`.
extensions.add(GlParticleContainerPipe, CanvasParticleContainerPipe);

export interface CrowdStats {
  fps: number;
  animated: number;
  visible: number;
  rigs: number;
  statics: number;
  count: number;
  renderer: string;
  tiles: number;
}

export interface EngineOptions {
  host: HTMLElement;
  source: CrowdSource;
  presets: Record<string, string>;
  defaultPreset: string;
  mobile: boolean;
  reducedMotion: boolean;
  initialCamera?: Camera | null;
  /** Kolik px dole zakrývají ovládací prvky (výchozí pohled pak ukáže pódium nad nimi). */
  insetBottom?: number;
  /** Index, na který se má kamera zaměřit (stránka /demonstrace/[id]). */
  focusIndex?: number | null;
  onSelect?: (p: CrowdPerson) => void;
  onCamera?: (c: Camera) => void;
  onMeta?: (count: number, demo: boolean) => void;
  onError?: (e: unknown) => void;
  onStats?: (s: CrowdStats) => void;
}

interface Colors {
  pal: StickmanPalette;
  surface: number;
  ink: number;
  blue: number;
  red: number;
  tint: number;
  soft: number;
  font: string;
}

const MAX_TILES_IN_VIEW = 24;
const TILE_CONCURRENCY = 4;
const MAX_CACHED_TILES = 200;
const TEXT_RES = 4;
const TEXT_CACHE = 400;

function cssColor(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}
function hex(c: string): number {
  const m = /^#([0-9a-f]{6})/i.exec(c);
  if (m) return parseInt(m[1]!, 16);
  const s = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (s) return parseInt(s[1]! + s[1] + s[2] + s[2] + s[3] + s[3], 16);
  const rgb = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c);
  if (rgb) return (Number(rgb[1]) << 16) | (Number(rgb[2]) << 8) | Number(rgb[3]);
  return 0x0b1b33;
}
function asHex(n: number) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function readColors(host: Element): Colors {
  const root = document.documentElement;
  const v = (n: string, f: string) => asHex(hex(cssColor(host, n, f)));
  const ink = v("--ink", "#0B1B33");
  const surface = v("--surface", "#FFFFFF");
  const blue = v("--blue", "#11457E");
  const red = v("--red", "#D7141A");
  const onBlue = v("--on-blue", "#FFFFFF");
  const tint = v("--blue-tint", "#E8EEF6");
  const soft = v("--rule-soft", "#C5CDD8");
  const fw = cssColor(root, "--font-mona-wide", "");
  const font = `${fw ? `${fw}, ` : ""}"Mona Sans Expanded", "Arial Black", Arial, sans-serif`;
  const pal: StickmanPalette = {
    ink,
    surface,
    signFill: { white: surface, blue, red },
    signText: { white: ink, blue: onBlue, red: onBlue },
    tricolor: { white: "#FFFFFF", red: "#D7141A", blue: "#11457E" },
  };
  return { pal, surface: hex(surface), ink: hex(ink), blue: hex(blue), red: hex(red), tint: hex(tint), soft: hex(soft), font };
}

/** Jedna postava ze spritů. */
class Rig {
  readonly c = new Container();
  readonly lines: Sprite[] = [];
  readonly sign: Sprite;
  readonly text: Sprite;
  readonly head: Sprite;
  readonly scarf: Sprite;
  readonly fist: Sprite;
  person!: CrowdPerson;
  params!: StickmanParams;
  textKey = "";
  constructor(atlas: Texture[], white: Texture) {
    // atlas[0] = cedule (dočasně), [1] = hlava, [2] = šála
    for (let i = 0; i < 2; i++) this.lines.push(this.line(white));
    this.sign = new Sprite(atlas[0]);
    this.sign.anchor.set(0.5);
    this.c.addChild(this.sign);
    this.text = new Sprite(Texture.EMPTY);
    this.text.anchor.set(0.5);
    this.c.addChild(this.text);
    for (let i = 0; i < 11; i++) this.lines.push(this.line(white));
    this.fist = this.line(white);
    this.scarf = new Sprite(atlas[2]);
    this.c.addChild(this.scarf);
    this.head = new Sprite(atlas[1]);
    this.c.addChild(this.head);
  }
  private line(white: Texture) {
    const s = new Sprite(white);
    s.anchor.set(0.5);
    this.c.addChild(s);
    return s;
  }
}

export class CrowdEngine {
  private o: EngineOptions;
  private renderer!: Renderer;
  private stage = new Container();
  private world = new Container();
  private bg = new Container();
  private dots!: ParticleContainer;
  private statics!: ParticleContainer;
  private rigLayer = new Container();
  private atlasCanvas = document.createElement("canvas");
  private atlasSource!: CanvasSource;
  private L: AtlasLayout = atlasLayout();
  private frames = new Map<string, Texture>();
  private colors!: Colors;

  private cam: Camera = { x: 0, y: -100, z: 1 };
  private vp: Viewport = { w: 1, h: 1 };
  private extent = 0;
  private demo = false;
  private persons = new Map<number, CrowdPerson>();
  private paramsCache = new Map<number, StickmanParams>();
  private tiles = new Map<number, number>(); // n → poslední použití
  private loading = new Set<number>();
  private queue: number[] = [];

  private rigs = new Map<number, Rig>();
  private rigPool: Rig[] = [];
  private animated = new Set<number>();
  private staticPool: Particle[] = [];
  private dotParticles: Particle[] = [];
  private dotsFrom = -1;
  private dotsDirty = true;
  private textCache = new Map<string, Texture>();

  private built: { rect: Rect; z: number } | null = null;
  private viewDirty = true;
  private renderDirty = true;
  private visibleCount = 0;
  private raf = 0;
  private running = false;
  private destroyed = false;
  private tween: { from: Camera; to: Camera; t0: number; ms: number } | null = null;
  private fpsFrames = 0;
  private fpsT0 = 0;
  private fps = 0;
  private lastStats = 0;
  private bgZoom = 0;
  private bgLines: Sprite[] = [];
  private textMeasure = document.createElement("canvas").getContext("2d")!;
  private reducedMotion: boolean;
  private cleanup: (() => void)[] = [];

  constructor(o: EngineOptions) {
    this.o = o;
    this.reducedMotion = o.reducedMotion;
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.canvas as HTMLCanvasElement;
  }
  get camera(): Camera {
    return { ...this.cam };
  }
  get count(): number {
    return this.extent;
  }
  get rendererName(): string {
    return this.renderer?.name ?? "";
  }

  async init(): Promise<void> {
    const { host } = this.o;
    this.vp = { w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) };
    this.colors = readColors(host);
    try {
      await document.fonts?.load(`${SIGN_FONT_WEIGHT} 24px ${this.colors.font}`);
    } catch {
      /* písmo se dočte později */
    }
    this.renderer = await autoDetectRenderer({
      preference: ["webgl", "canvas"],
      width: this.vp.w,
      height: this.vp.h,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      antialias: true,
      backgroundColor: this.colors.surface,
      skipExtensionImports: true,
    });
    if (this.destroyed) {
      this.renderer.destroy();
      return;
    }
    const canvas = this.canvas;
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    this.atlasCanvas.width = ATLAS_W;
    this.atlasCanvas.height = ATLAS_H;
    this.atlasSource = new CanvasSource({ resource: this.atlasCanvas, scaleMode: "linear", autoGenerateMipmaps: true });
    this.paintAtlas();
    const atlasTex = new Texture({ source: this.atlasSource });

    this.dots = new ParticleContainer({ texture: atlasTex, dynamicProperties: { position: false, color: false, vertex: false, uvs: false, rotation: false } });
    this.statics = new ParticleContainer({ texture: atlasTex, dynamicProperties: { position: false, color: false, vertex: false, uvs: false, rotation: false } });
    this.rigLayer.sortableChildren = true;
    this.world.addChild(this.bg, this.dots, this.statics, this.rigLayer);
    this.stage.addChild(this.world);
    this.buildBackground();

    this.bindInput();
    this.bindLifecycle();

    // Data
    let meta;
    try {
      meta = await this.o.source.meta();
    } catch (e) {
      this.o.onError?.(e);
      meta = { count: 0, tiles: 0, tileSize: 1000, demo: false };
    }
    this.extent = Math.max(0, meta.count);
    this.demo = meta.demo;
    this.o.onMeta?.(this.extent, this.demo);
    this.buildBackground();

    if (this.o.initialCamera) this.cam = this.clamp(this.o.initialCamera);
    else if (this.o.focusIndex != null) this.cam = this.clamp(this.cameraOnIndex(this.o.focusIndex, true));
    else this.cam = this.startCamera();
    this.applyCamera();
    this.start();
  }

  // ---------- Kamera ----------

  private bounds(): Rect {
    const b = crowdBounds(Math.max(1, this.extent));
    return { x0: Math.min(b.x0, STAGE.x0), x1: Math.max(b.x1, STAGE.x1), y0: b.y0, y1: STAGE.y1 + 40 };
  }
  private clamp(c: Camera): Camera {
    return clampCamera(c, this.bounds(), this.vp);
  }

  /** Výchozí pohled: pódium dole, přední řady s čitelnými cedulemi. */
  startCamera(): Camera {
    const z = this.o.mobile ? 1.15 : 1.3;
    const y = STAGE.y1 + (this.o.mobile ? 6 : 24) - (this.vp.h / 2 - (this.o.insetBottom ?? 0)) / z;
    return this.clamp({ x: 0, y, z });
  }
  /** Kamera na postavě; `upper` = postava v horní třetině (pod ní se otevře karta). */
  cameraOnIndex(index: number, upper = false): Camera {
    const p = positionFor(index);
    const z = Math.min(4, (this.o.mobile ? 1.4 : 1.6) / p.scale);
    return { x: p.x, y: p.y - 55 * p.scale + (upper ? (this.vp.h * 0.22) / z : 0), z };
  }
  endCamera(): Camera {
    return this.clamp(this.cameraOnIndex(Math.max(0, this.extent - 1)));
  }

  setCamera(c: Camera, animate = false) {
    const to = this.clamp(c);
    if (animate && !this.reducedMotion) {
      this.tween = { from: { ...this.cam }, to, t0: performance.now(), ms: 450 };
    } else {
      this.tween = null;
      this.cam = to;
      this.applyCamera();
    }
    this.wake();
  }
  panBy(dxPx: number, dyPx: number) {
    this.tween = null;
    this.cam = this.clamp({ x: this.cam.x + dxPx / this.cam.z, y: this.cam.y + dyPx / this.cam.z, z: this.cam.z });
    this.applyCamera();
  }
  zoomBy(factor: number, sx = this.vp.w / 2, sy = this.vp.h / 2) {
    this.tween = null;
    this.cam = this.clamp(zoomAt(this.cam, this.vp, sx, sy, factor));
    this.applyCamera();
  }
  goStart() {
    this.setCamera(this.startCamera(), true);
  }
  goEnd() {
    this.setCamera(this.endCamera(), true);
  }
  goTo(index: number, upper = false) {
    this.setCamera(this.cameraOnIndex(index, upper), true);
  }

  private applyCamera() {
    this.world.scale.set(this.cam.z);
    this.world.position.set(this.vp.w / 2 - this.cam.x * this.cam.z, this.vp.h / 2 - this.cam.y * this.cam.z);
    this.renderDirty = true;
    const b = this.built;
    if (!b) this.viewDirty = true;
    else {
      const r = viewRect(this.cam, this.vp);
      const zr = this.cam.z / b.z;
      if (r.x0 < b.rect.x0 || r.y0 < b.rect.y0 || r.x1 > b.rect.x1 || r.y1 > b.rect.y1 || zr > 1.12 || zr < 0.89) this.viewDirty = true;
    }
    this.o.onCamera?.(this.camera);
    this.wake();
  }

  /** Index postavy uprostřed výřezu (klávesa Enter). */
  centerPerson(): CrowdPerson | null {
    const i = nearestIndex(this.cam.x, this.cam.y, this.extent, 140 / Math.min(1, this.cam.z), (k) => this.persons.has(k));
    return i === null ? null : (this.persons.get(i) ?? null);
  }

  /** Data osoby (z dlaždice nebo z API). */
  personAt(index: number): CrowdPerson | null {
    return this.persons.get(index) ?? null;
  }
  addPerson(p: CrowdPerson) {
    this.persons.set(p.index, p);
    if (p.index >= this.extent) {
      this.extent = p.index + 1;
      this.dotsDirty = true;
    }
    this.viewDirty = true;
    this.wake();
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v;
    this.viewDirty = true;
    this.wake();
  }

  // ---------- Vstup ----------

  private bindInput() {
    const el = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let pinchD = 0;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) {
        downAt = { ...local(e), t: performance.now() };
        moved = false;
      } else downAt = null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
      this.tween = null;
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = local(e);
      if (pointers.size === 1) {
        if (downAt && Math.hypot(cur.x - downAt.x, cur.y - downAt.y) > 6) moved = true;
        if (moved) this.panBy(prev.x - cur.x, prev.y - cur.y);
      }
      pointers.set(e.pointerId, cur);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinchD > 0 && d > 0) this.zoomBy(d / pinchD, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        pinchD = d;
        moved = true;
      }
    };
    const onUp = (e: PointerEvent) => {
      const had = pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchD = 0;
      if (had && downAt && !moved && performance.now() - downAt.t < 600) {
        const w = screenToWorld(this.cam, this.vp, downAt.x, downAt.y);
        const i = hitTest(w.x, w.y, this.extent, (k) => this.persons.has(k));
        if (i !== null) {
          const p = this.persons.get(i);
          if (p) this.o.onSelect?.(p);
        }
      }
      if (pointers.size === 0) downAt = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    this.cleanup.push(() => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    });
  }

  private bindLifecycle() {
    const onVis = () => {
      if (document.hidden) this.stop();
      else this.start();
    };
    document.addEventListener("visibilitychange", onVis);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.o.host);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => this.retheme();
    mq.addEventListener("change", onTheme);
    this.cleanup.push(() => {
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      mq.removeEventListener("change", onTheme);
    });
  }

  private resize() {
    const w = Math.max(1, this.o.host.clientWidth);
    const h = Math.max(1, this.o.host.clientHeight);
    if (w === this.vp.w && h === this.vp.h) return;
    this.vp = { w, h };
    this.renderer.resize(w, h);
    this.cam = this.clamp(this.cam);
    this.built = null;
    this.applyCamera();
  }

  private retheme() {
    // Motiv se mění přes CSS proměnné – chvíli počkat, než se přepočítají.
    requestAnimationFrame(() => {
      this.colors = readColors(this.o.host);
      this.renderer.background.color = this.colors.surface;
      this.paintAtlas();
      for (const t of this.textCache.values()) t.destroy(true);
      this.textCache.clear();
      for (const [i, r] of this.rigs) {
        this.releaseRig(r);
        this.rigs.delete(i);
      }
      this.buildBackground();
      this.dotsDirty = true;
      this.viewDirty = true;
      this.wake();
    });
  }

  // ---------- Textury ----------

  private paintAtlas() {
    const ctx = this.atlasCanvas.getContext("2d")!;
    drawAtlas(ctx, this.L, this.colors.pal, asHex(this.colors.soft));
    this.atlasSource.update();
    if (this.frames.size === 0) {
      const mk = (f: Frame) => new Texture({ source: this.atlasSource, frame: new Rectangle(f.x, f.y, f.w, f.h), defaultAnchor: { x: f.ax / f.w, y: f.ay / f.h } });
      for (const [k, f] of this.L.silhouette) this.frames.set(`s:${k}`, mk(f));
      for (const [k, f] of this.L.head) this.frames.set(`h:${k}`, mk(f));
      for (const [k, f] of this.L.sign) this.frames.set(`g:${k}`, mk(f));
      this.frames.set("placeholder", mk(this.L.placeholder));
      this.frames.set("scarf", mk(this.L.scarf));
      this.frames.set("flag", mk(this.L.flag));
      this.frames.set("white", mk(this.L.white));
    }
  }
  private frame(k: string): Texture {
    return this.frames.get(k)!;
  }

  /** Text cedule předrenderovaný do malé textury (cache podle textu, tvaru a barvy). */
  private textTexture(text: string, shape: StickmanParams["signShape"], color: SignColor): Texture {
    const key = `${shape}|${color}|${text}`;
    const hit = this.textCache.get(key);
    if (hit) {
      this.textCache.delete(key);
      this.textCache.set(key, hit);
      return hit;
    }
    const m = this.textMeasure;
    const font = this.colors.font;
    const measure = (t: string, size: number) => {
      m.font = `${SIGN_FONT_WEIGHT} ${size * 10}px ${font}`;
      return m.measureText(t).width / 10;
    };
    const lay = layoutSignText(text, shape, measure);
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(lay.innerW * TEXT_RES);
    cv.height = Math.ceil(lay.innerH * TEXT_RES);
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = this.colors.pal.signText[color];
    ctx.font = `${SIGN_FONT_WEIGHT} ${lay.fontSize * TEXT_RES}px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const top = cv.height / 2 - ((lay.lines.length - 1) * lay.lineHeight * TEXT_RES) / 2;
    lay.lines.forEach((l, i) => ctx.fillText(l, cv.width / 2, top + i * lay.lineHeight * TEXT_RES));
    const tex = new Texture({ source: new CanvasSource({ resource: cv, scaleMode: "linear" }) });
    this.textCache.set(key, tex);
    if (this.textCache.size > TEXT_CACHE) {
      const inUse = new Set([...this.rigs.values()].map((r) => r.textKey));
      for (const [k, t] of this.textCache) {
        if (this.textCache.size <= TEXT_CACHE * 0.8) break;
        if (inUse.has(k)) continue;
        this.textCache.delete(k);
        t.destroy(true);
      }
    }
    return tex;
  }

  // ---------- Pozadí ----------

  private buildBackground() {
    for (const c of this.bg.removeChildren()) c.destroy();
    this.bgLines = [];
    const white = Texture.WHITE;
    const b = this.bounds();
    const rect = (x: number, y: number, w: number, h: number, tint: number) => {
      const s = new Sprite(white);
      s.position.set(x, y);
      s.width = w;
      s.height = h;
      s.tint = tint;
      this.bg.addChild(s);
      return s;
    };
    // Dlažba: vodorovné linky po řadách a sbíhavé linky k úběžníku za davem (--blue-tint).
    const maxRow = rowOf(Math.max(0, this.extent - 1)) + 4;
    const lines: Sprite[] = [];
    const pad = 400;
    for (let r = 0; r <= maxRow; r += 3) {
      const y = rowY(r) + 18 * rowScale(r);
      const s = rect(b.x0 - pad, y, b.x1 - b.x0 + 2 * pad, 1, this.colors.tint);
      lines.push(s);
    }
    const yFront = STAGE.y0;
    const yBack = rowY(maxRow);
    const sBack = rowScale(maxRow);
    const step = LAYOUT.spacingX * 3;
    const n = Math.ceil((b.x1 + pad) / step);
    for (let k = -n; k <= n; k++) {
      const x1 = k * step;
      const x2 = k * step * sBack;
      const len = Math.hypot(x2 - x1, yBack - yFront);
      const s = new Sprite(white);
      s.anchor.set(0, 0.5);
      s.position.set(x1, yFront);
      s.rotation = Math.atan2(yBack - yFront, x2 - x1);
      s.width = len;
      s.height = 1;
      s.tint = this.colors.tint;
      this.bg.addChild(s);
      lines.push(s);
    }
    this.bgLines = lines;
    this.bgZoom = 0;
    // Pódium: podlaha v --blue-tint, čelo v --surface s linkou --ink, uprostřed celá vlajka 3:2.
    rect(STAGE.x0, STAGE.y0, STAGE.x1 - STAGE.x0, STAGE.top, this.colors.tint);
    rect(STAGE.x0, STAGE.y0 + STAGE.top, STAGE.x1 - STAGE.x0, STAGE.y1 - STAGE.y0 - STAGE.top, this.colors.surface);
    const edge = 2;
    rect(STAGE.x0, STAGE.y0, STAGE.x1 - STAGE.x0, edge, this.colors.ink);
    rect(STAGE.x0, STAGE.y0 + STAGE.top - edge / 2, STAGE.x1 - STAGE.x0, edge, this.colors.ink);
    rect(STAGE.x0, STAGE.y1 - edge, STAGE.x1 - STAGE.x0, edge, this.colors.ink);
    rect(STAGE.x0, STAGE.y0, edge, STAGE.y1 - STAGE.y0, this.colors.ink);
    rect(STAGE.x1 - edge, STAGE.y0, edge, STAGE.y1 - STAGE.y0, this.colors.ink);
    const flag = new Sprite(this.frame("flag"));
    const k = STAGE.flagH / 44 / PART_RES;
    flag.scale.set(k);
    flag.position.set(0, STAGE.y0 + STAGE.top + (STAGE.y1 - STAGE.y0 - STAGE.top) / 2);
    this.bg.addChild(flag);
  }

  /** Linky dlažby drží tloušťku ~1 px při každém přiblížení. */
  private updateBgThickness() {
    if (Math.abs(this.bgZoom - this.cam.z) / this.cam.z < 0.05) return;
    this.bgZoom = this.cam.z;
    const h = 1.25 / this.cam.z;
    // Při pohledu na celý dav by dlažba splynula v šrafu – schovat ji.
    const show = this.cam.z >= 0.2;
    for (const s of this.bgLines) {
      s.height = h;
      s.visible = show;
    }
  }

  // ---------- Výřez, LOD, dlaždice ----------

  private paramsOf(p: CrowdPerson): StickmanParams {
    let v = this.paramsCache.get(p.index);
    if (!v || v.seed !== p.seed) {
      v = generateStickman(p.seed);
      this.paramsCache.set(p.index, v);
    }
    return v;
  }

  private signTextOf(p: CrowdPerson) {
    return sloganText(p.slogan, this.o.presets, this.o.defaultPreset);
  }

  /** Přestaví množinu viditelných postav (ořez výřezem, LOD, strop animovaných). */
  private rebuildView() {
    this.viewDirty = false;
    const z = this.cam.z;
    const view = viewRect(this.cam, this.vp);
    const mx = (view.x1 - view.x0) * 0.2;
    const my = (view.y1 - view.y0) * 0.2;
    const rect: Rect = { x0: view.x0 - mx, y0: view.y0 - my, x1: view.x1 + mx, y1: view.y1 + my };
    this.built = { rect, z };

    // První řada, která je už jen tečkami: 100·s·z < LOD_PX.far.
    const sMin = LOD_PX.far / (100 * z);
    const dotRow = sMin >= 1 ? 0 : Math.max(0, Math.ceil(LAYOUT.perspectiveK * (1 / sMin - 1)));
    const dotsFrom = Math.min(this.extent, rowStart(dotRow));
    if (dotsFrom !== this.dotsFrom) {
      this.dotsFrom = dotsFrom;
      this.dotsDirty = true;
    }

    const cands: [number, number, number][] = [];
    const statics: { i: number; tex: Texture; x: number; y: number; s: number }[] = [];
    let visible = 0;
    const detailCount = dotsFrom;
    forEachInRect(rect, detailCount, (i) => {
      visible++;
      const pos = positionFor(i);
      const lod = lodFor(figurePx(pos.scale, z));
      const p = this.persons.get(i);
      if (!p) {
        if (!this.loadedTile(i)) statics.push({ i, tex: this.frame("placeholder"), x: pos.x, y: pos.y, s: pos.scale });
        return;
      }
      const params = this.paramsOf(p);
      if (lod === "near" || lod === "mid") cands.push([i, pos.x, pos.y - 50 * pos.scale]);
      else statics.push({ i, tex: this.frame(`s:${silKey(p.pose, p.signColor, params.signShape)}`), x: pos.x, y: pos.y, s: pos.scale * params.height });
    });
    this.visibleCount = visible + Math.max(0, this.extent - dotsFrom);

    const cap = animatedCap(this.o.mobile);
    const chosen = selectAnimated(cands, this.cam.x, this.cam.y, cap);
    for (const c of cands) {
      if (chosen.has(c[0])) continue;
      const p = this.persons.get(c[0])!;
      const params = this.paramsOf(p);
      const pos = positionFor(c[0]);
      statics.push({ i: c[0], tex: this.frame(`s:${silKey(p.pose, p.signColor, params.signShape)}`), x: pos.x, y: pos.y, s: pos.scale * params.height });
    }
    this.animated = chosen;

    // Postavy ze spritů
    for (const [i, r] of this.rigs) {
      if (!chosen.has(i)) {
        this.releaseRig(r);
        this.rigs.delete(i);
      }
    }
    for (const i of chosen) {
      const p = this.persons.get(i)!;
      let r = this.rigs.get(i);
      if (!r || r.person !== p) {
        if (r) this.releaseRig(r);
        r = this.acquireRig(p);
        this.rigs.set(i, r);
      }
      const pos = positionFor(i);
      const near = figurePx(pos.scale, z) >= LOD_PX.near;
      r.text.visible = near;
      if (near && !r.textKey) this.assignText(r);
      this.poseRig(r, this.reducedMotion ? undefined : performance.now());
    }

    // Statické siluety (zezadu dopředu)
    statics.sort((a, b) => a.y - b.y);
    const arr: Particle[] = [];
    for (let k = 0; k < statics.length; k++) {
      const st = statics[k]!;
      let pt = this.staticPool[k];
      if (!pt) {
        pt = new Particle({ texture: st.tex });
        this.staticPool[k] = pt;
      }
      pt.texture = st.tex;
      pt.anchorX = st.tex.defaultAnchor?.x ?? 0.5;
      pt.anchorY = st.tex.defaultAnchor?.y ?? 1;
      pt.x = st.x;
      pt.y = st.y;
      const sc = st.s / SIL_RES;
      pt.scaleX = sc;
      pt.scaleY = sc;
      arr.push(pt);
    }
    this.statics.particleChildren = arr;
    this.statics.update();

    if (this.dotsDirty) this.rebuildDots();
    this.loadTiles(view);
    this.renderDirty = true;
  }

  private loadedTile(i: number) {
    return this.tiles.has(Math.floor(i / 1000));
  }

  private rebuildDots() {
    this.dotsDirty = false;
    const tex = this.frame("white");
    const from = Math.max(0, this.dotsFrom);
    for (let i = this.dotParticles.length; i < this.extent; i++) {
      const pos = positionFor(i);
      const size = (30 * pos.scale) / 8;
      this.dotParticles.push(new Particle({ texture: tex, x: pos.x, y: pos.y - 45 * pos.scale, scaleX: size, scaleY: size, anchorX: 0.5, anchorY: 0.5, tint: this.colors.soft }));
    }
    for (let i = from; i < this.extent; i++) {
      const p = this.persons.get(i);
      const d = this.dotParticles[i]!;
      d.tint = !p ? this.colors.soft : this.dotColor(p.signColor);
      d.alpha = !p && this.loadedTile(i) ? 0 : 1;
    }
    // Zadní řady dřív (vyšší index = dál).
    this.dots.particleChildren = this.dotParticles.slice(from, this.extent).reverse();
    this.dots.update();
  }

  private dotColor(c: SignColor) {
    return c === "blue" ? this.colors.blue : c === "red" ? this.colors.red : this.colors.ink;
  }

  private loadTiles(view: Rect) {
    if (this.extent === 0) return;
    const w = view.x1 - view.x0;
    const need = tilesForRect(view, this.extent, { margin: w * 0.25, max: MAX_TILES_IN_VIEW });
    const now = performance.now();
    for (const n of need) if (this.tiles.has(n)) this.tiles.set(n, now);
    this.queue = need.filter((n) => !this.tiles.has(n) && !this.loading.has(n));
    this.pump();
  }

  private pump() {
    while (this.loading.size < TILE_CONCURRENCY && this.queue.length) {
      const n = this.queue.shift()!;
      this.loading.add(n);
      this.o.source
        .tile(n)
        .then((items) => {
          if (this.destroyed) return;
          this.tiles.set(n, performance.now());
          let maxIdx = -1;
          for (const p of items) {
            this.persons.set(p.index, p);
            maxIdx = Math.max(maxIdx, p.index);
          }
          if (maxIdx >= this.extent) {
            this.extent = maxIdx + 1;
            this.buildBackground();
          }
          this.evictTiles();
          this.dotsDirty = true;
          this.viewDirty = true;
          this.wake();
        })
        .catch((e) => {
          // Dlaždice se zkusí znovu při dalším posunu výřezu.
          if (!this.destroyed) console.warn("crowd tile", n, e);
        })
        .finally(() => {
          this.loading.delete(n);
          if (!this.destroyed) this.pump();
        });
    }
  }

  private evictTiles() {
    if (this.tiles.size <= MAX_CACHED_TILES) return;
    const sorted = [...this.tiles.entries()].sort((a, b) => a[1] - b[1]);
    for (const [n] of sorted.slice(0, this.tiles.size - MAX_CACHED_TILES)) {
      this.tiles.delete(n);
      for (let i = n * 1000; i < (n + 1) * 1000; i++) {
        if (this.rigs.has(i)) continue;
        this.persons.delete(i);
        this.paramsCache.delete(i);
      }
    }
  }

  // ---------- Postavy ze spritů ----------

  private acquireRig(p: CrowdPerson): Rig {
    const params = this.paramsOf(p);
    const r = this.rigPool.pop() ?? new Rig([this.frame("g:rect|white"), this.frame("h:none|0"), this.frame("scarf")], Texture.WHITE);
    r.person = p;
    r.params = params;
    r.textKey = "";
    r.text.texture = Texture.EMPTY;
    r.sign.texture = this.frame(`g:${signKey(params.signShape, p.signColor)}`);
    r.head.texture = this.frame(`h:${headKey(params.hair, params.glasses)}`);
    r.scarf.visible = params.scarf;
    const ink = this.colors.ink;
    for (const l of r.lines) l.tint = ink;
    r.fist.tint = ink;
    const pos = positionFor(p.index);
    r.c.position.set(pos.x, pos.y);
    r.c.scale.set(pos.scale);
    r.c.zIndex = pos.y;
    this.rigLayer.addChild(r.c);
    return r;
  }

  private releaseRig(r: Rig) {
    this.rigLayer.removeChild(r.c);
    r.textKey = "";
    if (this.rigPool.length < 2000) this.rigPool.push(r);
    else r.c.destroy({ children: true });
  }

  private assignText(r: Rig) {
    const text = this.signTextOf(r.person);
    if (!text) return;
    const key = `${r.params.signShape}|${r.person.signColor}|${text}`;
    r.text.texture = this.textTexture(text, r.params.signShape, r.person.signColor);
    r.textKey = key;
  }

  private poseRig(r: Rig, t: number | undefined) {
    const fig = figureGeometry(r.params, poseAt(r.params, r.person.pose, t));
    this.applyFigure(r, fig);
  }

  private applyFigure(r: Rig, fig: Figure) {
    const segs = fig.poles.length === 2 ? fig.poles : fig.poles.length === 1 ? [fig.poles[0]!, null] : [null, null];
    for (let k = 0; k < 2; k++) setLine(r.lines[k]!, segs[k] ?? null);
    for (let k = 0; k < 11; k++) setLine(r.lines[2 + k]!, fig.body[k]!);
    const sg = fig.sign;
    const ang = (sg.angle * Math.PI) / 180;
    r.sign.position.set(sg.x, sg.y);
    r.sign.rotation = ang;
    r.sign.scale.set(fig.scale / PART_RES);
    if (r.text.visible) {
      r.text.position.set(sg.x, sg.y);
      r.text.rotation = ang;
      r.text.scale.set(fig.scale / TEXT_RES);
    }
    const h = fig.head;
    r.head.position.set(h.x, h.y);
    r.head.rotation = (h.angle * Math.PI) / 180;
    r.head.scale.set(h.r / 8 / PART_RES);
    if (fig.fist) {
      r.fist.visible = true;
      r.fist.position.set(fig.fist.x, fig.fist.y);
      r.fist.rotation = 0;
      r.fist.width = fig.fist.size;
      r.fist.height = fig.fist.size;
    } else r.fist.visible = false;
    if (fig.scarf) {
      r.scarf.position.set(fig.scarf.x, fig.scarf.y);
      r.scarf.rotation = (fig.scarf.angle * Math.PI) / 180;
      r.scarf.scale.set(fig.scale / PART_RES);
    }
  }

  // ---------- Smyčka ----------

  start() {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.fpsT0 = performance.now();
    this.fpsFrames = 0;
    this.raf = requestAnimationFrame(this.tick);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  private wake() {
    this.renderDirty = true;
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.ms);
      const e = 1 - Math.pow(1 - k, 3);
      const { from, to } = this.tween;
      // Zoom interpolovat logaritmicky, ať let nepůsobí skokově.
      this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * e) };
      if (k >= 1) this.tween = null;
      this.applyCamera();
    }
    if (this.viewDirty) this.rebuildView();
    this.updateBgThickness();
    const animate = !this.reducedMotion && this.rigs.size > 0;
    if (animate) {
      for (const [i, r] of this.rigs) if (this.animated.has(i)) this.poseRig(r, now);
      this.renderDirty = true;
    }
    if (this.renderDirty) {
      this.renderer.render({ container: this.stage });
      this.renderDirty = false;
    }
    this.fpsFrames++;
    if (now - this.fpsT0 >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsT0));
      this.fpsFrames = 0;
      this.fpsT0 = now;
    }
    if (now - this.lastStats > 500) {
      this.lastStats = now;
      this.o.onStats?.(this.stats());
    }
  };

  stats(): CrowdStats {
    return {
      fps: this.fps,
      animated: this.reducedMotion ? 0 : this.rigs.size,
      visible: this.visibleCount,
      rigs: this.rigs.size,
      statics: this.statics?.particleChildren.length ?? 0,
      count: this.extent,
      renderer: this.rendererName,
      tiles: this.tiles.size,
    };
  }

  /** Pro minimapu: hranice davu a výřez kamery ve světě. */
  minimapState() {
    return { bounds: this.bounds(), view: viewRect(this.cam, this.vp), count: this.extent };
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    for (const c of this.cleanup) c();
    this.cleanup = [];
    for (const t of this.textCache.values()) t.destroy(true);
    this.textCache.clear();
    try {
      this.stage.destroy({ children: true });
      this.renderer?.destroy({ removeView: true });
    } catch {
      /* už zničeno */
    }
  }
}

/** Úsečka jako sprite bílého čtverce: délka + tloušťka (hranaté konce přesahují o půl tloušťky). */
function setLine(s: Sprite, g: { x1: number; y1: number; x2: number; y2: number } | null) {
  if (!g) {
    s.visible = false;
    return;
  }
  s.visible = true;
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  s.position.set((g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2);
  s.rotation = Math.atan2(dy, dx);
  s.width = Math.hypot(dx, dy) + STROKE;
  s.height = STROKE;
}
