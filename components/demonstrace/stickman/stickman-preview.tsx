"use client";

import { useEffect, useMemo, useRef } from "react";
import { cx } from "@/components/ui/format";
import { hasSign, type Pose, type SignColor } from "@/lib/demo/constants";
import { figureGeometry, type Figure } from "@/lib/stickman/geometry";
import { generateStickman } from "@/lib/stickman/params";
import { poseAt } from "@/lib/stickman/poses";
import { PALETTE_CSS } from "@/lib/stickman/sign";
import { stickmanSvg } from "@/lib/stickman/svg";

/** Písmo cedule v prohlížeči: Mona Sans Expanded z next/font (proměnná na <html>). */
export const SIGN_FONT_CSS = "var(--font-mona-wide), 'Mona Sans Expanded', 'Arial Black', sans-serif";

/**
 * Náhled panáčka jako SVG (připojovací stránka, karta v davu, galerie vzhledů). Barvy z CSS
 * proměnných. Animuje se jen bez prefers-reduced-motion a jen když je vidět. První vykreslení
 * (i na serveru) je klidová póza. Animace SVG nepřestavuje: jednou se vloží celé, pak se ve
 * snímcích (30 fps) jen přepisují souřadnice a transformace existujících prvků.
 */
export function StickmanPreview({
  seed,
  pose,
  signColor,
  signText,
  animate = true,
  title,
  className,
}: {
  seed: number;
  pose: Pose;
  signColor: SignColor;
  signText: string;
  animate?: boolean;
  /** Přístupný popis; bez něj je obrázek dekorativní. */
  title?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const params = useMemo(() => generateStickman(seed), [seed]);
  const opts = useMemo(
    () => ({ pose, signColor, signText, palette: PALETTE_CSS, fontFamily: SIGN_FONT_CSS, title }),
    [pose, signColor, signText, title],
  );
  const initial = useMemo(() => stickmanSvg(params, opts), [params, opts]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Vždy aktuální SVG: snímky předchozí animace mohly DOM změnit a React innerHTML znovu
    // nevloží, když se `initial` nezměnil. Úklid efektu DOM nepřepisuje – běží až po vložení
    // nového SVG a se starými props by vrátil předchozí ceduli, barvu i pózu.
    el.innerHTML = initial;
    if (!animate) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let visible = true;
    let nodes: FigureNodes | null | undefined;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(el);
    const withSign = hasSign(signColor);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || reduce.matches || now - last < 33) return;
      last = now;
      const fig = figureGeometry(params, poseAt(params, pose, now, withSign));
      if (nodes === undefined) nodes = bindNodes(el, fig);
      if (!nodes || !applyFigure(nodes, fig)) {
        // Struktura nesedí (nemělo by nastat) – záloha: celé SVG znovu.
        el.innerHTML = stickmanSvg(params, { ...opts, t: now });
        nodes = undefined;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [animate, initial, params, opts, pose, signColor]);

  // SVG je náš vlastní řetězec, text cedule je v něm escapovaný (escapeXml).
  return <div ref={ref} className={cx("[&>svg]:block [&>svg]:h-full [&>svg]:w-full", className)} dangerouslySetInnerHTML={{ __html: initial }} />;
}

interface FigureNodes {
  poles: Element[];
  sign: Element | null;
  body: Element;
  fist: Element | null;
  keys: Element | null;
  scarf: Element | null;
  head: Element;
  headScale: string;
  scale: string;
}

const n = (v: number) => String(Math.round(v * 100) / 100);

/**
 * Prvky SVG podle pořadí z figureSvg: tyče, (cedule), tělo, (pěst), (klíče), (šála), hlava. Za pózy se
 * počet prvků nemění, takže stačí jednou namapovat.
 */
function bindNodes(el: HTMLElement, fig: Figure): FigureNodes | null {
  const root = el.querySelector("svg > g");
  if (!root) return null;
  const c = Array.from(root.children);
  let k = 0;
  const poles = c.slice(k, (k += fig.poles.length));
  const sign = fig.sign && c[k]?.tagName.toLowerCase() === "g" ? c[k++]! : null;
  const body = c[k++];
  const fist = fig.fist ? (c[k++] ?? null) : null;
  const keys = fig.keys ? (c[k++] ?? null) : null;
  const scarf = fig.scarf ? (c[k++] ?? null) : null;
  const head = c[k++];
  if (!body || !head || k !== c.length || body.tagName.toLowerCase() !== "path") return null;
  const m = /scale\(([^)]+)\)/.exec(head.getAttribute("transform") ?? "");
  return { poles, sign, body, fist, keys, scarf, head, headScale: m?.[1] ?? "1", scale: n(fig.scale) };
}

function applyFigure(nd: FigureNodes, fig: Figure): boolean {
  if (nd.poles.length !== fig.poles.length || !!nd.fist !== !!fig.fist || !!nd.keys !== !!fig.keys || !!nd.scarf !== !!fig.scarf) return false;
  fig.poles.forEach((p, i) => {
    const l = nd.poles[i]!;
    l.setAttribute("x1", n(p.x1));
    l.setAttribute("y1", n(p.y1));
    l.setAttribute("x2", n(p.x2));
    l.setAttribute("y2", n(p.y2));
  });
  if (nd.sign && fig.sign) nd.sign.setAttribute("transform", `translate(${n(fig.sign.x)} ${n(fig.sign.y)}) rotate(${n(fig.sign.angle)})`);
  nd.body.setAttribute("d", fig.body.map((s) => `M${n(s.x1)} ${n(s.y1)}L${n(s.x2)} ${n(s.y2)}`).join(""));
  if (nd.fist && fig.fist) {
    nd.fist.setAttribute("x", n(fig.fist.x - fig.fist.size / 2));
    nd.fist.setAttribute("y", n(fig.fist.y - fig.fist.size / 2));
  }
  if (nd.keys && fig.keys) nd.keys.setAttribute("transform", `translate(${n(fig.keys.x)} ${n(fig.keys.y)}) rotate(${n(fig.keys.angle)}) scale(${nd.scale})`);
  if (nd.scarf && fig.scarf) nd.scarf.setAttribute("transform", `translate(${n(fig.scarf.x)} ${n(fig.scarf.y)}) rotate(${n(fig.scarf.angle)})`);
  const h = fig.head;
  nd.head.setAttribute("transform", `translate(${n(h.x)} ${n(h.y)}) rotate(${n(h.angle)}) scale(${nd.headScale})`);
  return true;
}
