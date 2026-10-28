/**
 * Ořez, posun a přiblížení fotky ve čtverci (čistá logika, bez DOM).
 *
 * Souřadnice jsou normalizované na stranu rámečku: čtverec = 0..1 × 0..1.
 * Fotka se při zoom = 1 vejde „cover“ (kratší strana = 1). `ox`, `oy` je levý horní
 * roh fotky v těchto jednotkách. V ose, kde je fotka větší než čtverec, ho musí celý
 * pokrýt; kde je menší (zoom < 1), musí celá ležet uvnitř čtverce.
 */
import { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM } from "./constants";

export interface Size {
  w: number;
  h: number;
}

export interface Crop {
  zoom: number;
  ox: number;
  oy: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Rozměr fotky v jednotkách rámečku při daném přiblížení. */
export function displaySize(img: Size, zoom: number): Size {
  const base = 1 / Math.min(img.w, img.h);
  return { w: img.w * base * zoom, h: img.h * base * zoom };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Povolený posun v jedné ose: větší fotka čtverec pokryje, menší v něm celá leží. */
function clampAxis(o: number, size: number): number {
  return clamp(o, Math.min(0, 1 - size), Math.max(0, 1 - size));
}

/** Zoom do povoleného rozsahu a posun tak, aby fotka čtverec pokryla, nebo v něm celá ležela. */
export function clampCrop(c: Crop, img: Size): Crop {
  const zoom = clampZoom(c.zoom);
  const d = displaySize(img, zoom);
  return { zoom, ox: clampAxis(c.ox, d.w), oy: clampAxis(c.oy, d.h) };
}

/** Pokrývá fotka celý čtverec? Když ne, kreslí se pod ní rozmazané pozadí. */
export function coversFrame(c: Crop, img: Size): boolean {
  const d = displaySize(img, c.zoom);
  const e = 1e-6;
  return c.ox <= e && c.oy <= e && c.ox + d.w >= 1 - e && c.oy + d.h >= 1 - e;
}

/** Výchozí ořez: zoom 1, fotka vystředěná. */
export function initialCrop(img: Size): Crop {
  const d = displaySize(img, DEFAULT_ZOOM);
  return { zoom: DEFAULT_ZOOM, ox: (1 - d.w) / 2, oy: (1 - d.h) / 2 };
}

/** Posun o (dx, dy) v jednotkách rámečku. */
export function panBy(c: Crop, dx: number, dy: number, img: Size): Crop {
  return clampCrop({ zoom: c.zoom, ox: c.ox + dx, oy: c.oy + dy }, img);
}

/**
 * Přiblížení na `zoom` tak, aby bod `anchor` (v jednotkách rámečku, např. pod kurzorem
 * nebo mezi prsty) zůstal na místě.
 */
export function zoomAt(c: Crop, zoom: number, anchor: Point, img: Size): Crop {
  const z = clampZoom(zoom);
  const k = z / c.zoom;
  return clampCrop({ zoom: z, ox: anchor.x - (anchor.x - c.ox) * k, oy: anchor.y - (anchor.y - c.oy) * k }, img);
}

/** Kam nakreslit fotku na plátno o straně `side` px (pro drawImage). */
export function drawRect(c: Crop, img: Size, side: number): { x: number; y: number; w: number; h: number } {
  const d = displaySize(img, c.zoom);
  return { x: c.ox * side, y: c.oy * side, w: d.w * side, h: d.h * side };
}

/** Gesto dvěma prsty: vzdálenost a střed dvou bodů. */
export function pinch(a: Point, b: Point): { dist: number; mid: Point } {
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** Zoom z kolečka myši (deltaY v px): plynulý, symetrický pro nahoru/dolů. */
export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-deltaY * 0.0015));
}

/** Zmenší rozměr tak, aby delší strana nepřesáhla `max` (nikdy nezvětšuje). */
export function fitWithin(s: Size, max: number): Size {
  const k = Math.min(1, max / Math.max(s.w, s.h));
  return { w: Math.max(1, Math.round(s.w * k)), h: Math.max(1, Math.round(s.h * k)) };
}

/** Krok klávesnice: šipky posouvají o 2 % (se Shiftem 10 %), +/− přibližují o 10 %. */
export type KeyAction = { pan: Point } | { zoom: number } | { reset: true } | null;

export function keyAction(key: string, shift: boolean): KeyAction {
  const step = shift ? 0.1 : 0.02;
  switch (key) {
    // Šipka posune fotku jejím směrem (jako tažení prstem).
    case "ArrowLeft":
      return { pan: { x: -step, y: 0 } };
    case "ArrowRight":
      return { pan: { x: step, y: 0 } };
    case "ArrowUp":
      return { pan: { x: 0, y: -step } };
    case "ArrowDown":
      return { pan: { x: 0, y: step } };
    case "+":
    case "=":
      return { zoom: 1.1 };
    case "-":
    case "_":
      return { zoom: 1 / 1.1 };
    case "0":
      return { reset: true };
    default:
      return null;
  }
}
