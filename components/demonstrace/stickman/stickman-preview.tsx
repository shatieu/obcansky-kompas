"use client";

import { useEffect, useMemo, useRef } from "react";
import { cx } from "@/components/ui/format";
import type { Pose, SignColor } from "@/lib/demo/constants";
import { generateStickman } from "@/lib/stickman/params";
import { PALETTE_CSS } from "@/lib/stickman/sign";
import { stickmanSvg } from "@/lib/stickman/svg";

/** Písmo cedule v prohlížeči: Mona Sans Expanded z next/font (proměnná na <html>). */
export const SIGN_FONT_CSS = "var(--font-mona-wide), 'Mona Sans Expanded', 'Arial Black', sans-serif";

/**
 * Náhled panáčka jako SVG (připojovací stránka, karta v davu). Barvy z CSS proměnných, takže
 * sleduje světlý i tmavý motiv. Animuje se jen bez prefers-reduced-motion a jen když je vidět.
 * První vykreslení (i na serveru) je klidová póza.
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
    if (!el || !animate) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(el);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || reduce.matches || now - last < 33) return;
      last = now;
      el.innerHTML = stickmanSvg(params, { ...opts, t: now });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.innerHTML = stickmanSvg(params, opts);
    };
  }, [animate, params, opts]);

  // SVG je náš vlastní řetězec, text cedule je v něm escapovaný (escapeXml).
  return <div ref={ref} className={cx("[&>svg]:block [&>svg]:h-full [&>svg]:w-full", className)} dangerouslySetInnerHTML={{ __html: initial }} />;
}
