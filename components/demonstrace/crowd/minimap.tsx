"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { positionFor, type Rect } from "@/lib/crowd/layout";

export interface MinimapHandle {
  draw(state: { bounds: Rect; view: Rect; count: number }): void;
}

const W = 152;
const H = 104;

/**
 * Minimapa v rohu (§6.2): celý dav jako tečky + rámeček výřezu. Klepnutím nebo tažením
 * se kamera přesune. Pro klávesnici je posun šipkami na plátně, minimapa je jen pomůcka.
 */
export function Minimap({ handle, onPick, label }: { handle: Ref<MinimapHandle>; onPick: (x: number, y: number) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useRef<{ count: number; key: string; img: HTMLCanvasElement | null; map: (x: number, y: number) => [number, number]; inv: (x: number, y: number) => [number, number] } | null>(null);

  useImperativeHandle(handle, () => ({
    draw({ bounds, view, count }) {
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
      const key = `${count}|${dot}|${bounds.x0}|${bounds.y0}|${bounds.x1}|${bounds.y1}`;
      if (!cache.current || cache.current.key !== key) {
        const bw = bounds.x1 - bounds.x0;
        const bh = bounds.y1 - bounds.y0;
        const k = Math.min((W - 8) / bw, (H - 8) / bh);
        const ox = (W - bw * k) / 2;
        const oy = (H - bh * k) / 2;
        const map = (x: number, y: number): [number, number] => [ox + (x - bounds.x0) * k, oy + (y - bounds.y0) * k];
        const inv = (sx: number, sy: number): [number, number] => [bounds.x0 + (sx - ox) / k, bounds.y0 + (sy - oy) / k];
        const img = document.createElement("canvas");
        img.width = W * dpr;
        img.height = H * dpr;
        const c = img.getContext("2d")!;
        c.scale(dpr, dpr);
        c.fillStyle = dot;
        // U velkého davu stačí každý n-tý (tečky by se stejně slily).
        const step = Math.max(1, Math.floor(count / 40000));
        for (let i = 0; i < count; i += step) {
          const p = positionFor(i);
          const [x, y] = map(p.x, p.y - 45 * p.scale);
          c.fillRect(x - 0.5, y - 0.5, 1.2, 1.2);
        }
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
      const cx = Math.max(1, Math.min(W - 1, x0));
      const cy = Math.max(1, Math.min(H - 1, y0));
      ctx.strokeRect(cx, cy, Math.max(4, Math.min(W - 1, x1) - cx), Math.max(4, Math.min(H - 1, y1) - cy));
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
      className="block h-[66px] w-[96px] border-2 border-ink bg-surface md:h-[104px] md:w-[152px]"
      style={{ touchAction: "none" }}
    />
  );
}
