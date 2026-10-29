"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { positionFor, type Rect } from "@/lib/crowd/layout";

export interface MinimapHandle {
  draw(state: { bounds: Rect; view: Rect; count: number; origin?: number }): void;
}

const W = 152;
const H = 104;
/** Nejmenší rámeček výřezu (px minimapy). */
const MIN_FRAME = 12;

function parseHex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (m) {
    const v = parseInt(m[1]!, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const rgb = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(c);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : [69, 78, 93];
}

/**
 * Minimapa v rohu (§6.2): hustota davu (sytost = počet lidí na pixel) + rámeček výřezu. Klepnutím nebo tažením
 * se kamera přesune. Pro klávesnici je posun šipkami na plátně, minimapa je jen pomůcka.
 */
export function Minimap({ handle, onPick, label }: { handle: Ref<MinimapHandle>; onPick: (x: number, y: number) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useRef<{ count: number; key: string; img: HTMLCanvasElement | null; map: (x: number, y: number) => [number, number]; inv: (x: number, y: number) => [number, number] } | null>(null);

  useImperativeHandle(handle, () => ({
    draw({ bounds, view, count, origin = 0 }) {
      const cv = ref.current;
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== W * dpr) {
        cv.width = W * dpr;
        cv.height = H * dpr;
      }
      const css = getComputedStyle(cv);
      const dot = css.getPropertyValue("--ink-secondary").trim() || "#454E5D";
      const ink = css.getPropertyValue("--ink").trim() || "#0B1B33";
      const key = `${count}|${origin}|${dot}|${bounds.x0}|${bounds.y0}|${bounds.x1}|${bounds.y1}`;
      if (!cache.current || cache.current.key !== key) {
        const bw = bounds.x1 - bounds.x0;
        const bh = bounds.y1 - bounds.y0;
        const k = Math.min((W - 8) / bw, (H - 8) / bh);
        const ox = (W - bw * k) / 2;
        const oy = (H - bh * k) / 2;
        const map = (x: number, y: number): [number, number] => [ox + (x - bounds.x0) * k, oy + (y - bounds.y0) * k];
        const inv = (sx: number, sy: number): [number, number] => [bounds.x0 + (sx - ox) / k, bounds.y0 + (sy - oy) / k];
        // Hustota: počet lidí na pixel minimapy → průhlednost (víc lidí = sytější). Jednotlivé
        // tečky by u velkého davu splynuly v šum a malý dav by byl skoro neviditelný.
        const pw = W * dpr;
        const ph = H * dpr;
        const grid = new Uint32Array(pw * ph);
        const step = Math.max(1, Math.floor((count - origin) / 200000));
        let max = 0;
        for (let i = origin; i < count; i += step) {
          const p = positionFor(i, origin);
          const [x, y] = map(p.x, p.y - 45 * p.scale);
          const gx = Math.floor(x * dpr);
          const gy = Math.floor(y * dpr);
          if (gx < 0 || gy < 0 || gx >= pw || gy >= ph) continue;
          const idx = gy * pw + gx;
          const v = (grid[idx] = grid[idx]! + 1);
          if (v > max) max = v;
        }
        const img = document.createElement("canvas");
        img.width = pw;
        img.height = ph;
        const c = img.getContext("2d")!;
        const data = c.createImageData(pw, ph);
        const rgb = parseHex(dot);
        const norm = Math.log1p(Math.max(1, max));
        for (let k = 0; k < grid.length; k++) {
          const v = grid[k]!;
          if (!v) continue;
          data.data[k * 4] = rgb[0];
          data.data[k * 4 + 1] = rgb[1];
          data.data[k * 4 + 2] = rgb[2];
          data.data[k * 4 + 3] = Math.round(255 * (0.35 + 0.65 * (Math.log1p(v) / norm)));
        }
        c.putImageData(data, 0, 0);
        cache.current = { count, key, img, map, inv };
      }
      const ctx = cv.getContext("2d")!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (cache.current.img) ctx.drawImage(cache.current.img, 0, 0);
      ctx.scale(dpr, dpr);
      const [x0, y0] = cache.current.map(view.x0, view.y0);
      const [x1, y1] = cache.current.map(view.x1, view.y1);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      // Rámeček výřezu nejmíň MIN_FRAME px (zblízka by byl tečkou), se středem ve středu výřezu.
      const fw = Math.max(MIN_FRAME, Math.min(W - 2, x1) - Math.max(1, x0));
      const fh = Math.max(MIN_FRAME * 0.75, Math.min(H - 2, y1) - Math.max(1, y0));
      const mx = Math.min(W - 1 - fw / 2, Math.max(1 + fw / 2, (x0 + x1) / 2));
      const my = Math.min(H - 1 - fh / 2, Math.max(1 + fh / 2, (y0 + y1) / 2));
      ctx.strokeRect(mx - fw / 2, my - fh / 2, fw, fh);
    },
  }));

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let down = false;
    const pick = (e: PointerEvent) => {
      const c = cache.current;
      if (!c) return;
      const r = cv.getBoundingClientRect();
      const [x, y] = c.inv(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
      onPick(x, y);
    };
    const onDown = (e: PointerEvent) => {
      down = true;
      cv.setPointerCapture?.(e.pointerId);
      pick(e);
    };
    const onMove = (e: PointerEvent) => {
      if (down) pick(e);
    };
    const onUp = () => {
      down = false;
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    return () => {
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
    };
  }, [onPick]);

  return (
    <canvas
      ref={ref}
      title={label}
      aria-hidden="true"
      className="block h-[104px] w-[152px] flex-none border-2 border-ink bg-surface"
      style={{ touchAction: "none" }}
    />
  );
}
