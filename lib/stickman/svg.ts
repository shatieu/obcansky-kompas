import { hasSign, type SignColor } from "@/lib/demo/constants";
import { figureGeometry, GLASSES_PATH, HAIR_PATHS, KEYS_PATH, KEYS_RING_R, KEYS_STROKE, scarfShapes, STROKE, VIEWBOX, type Figure } from "./geometry";
import type { Pose, StickmanParams } from "./params";
import { poseAt } from "./poses";
import { layoutSignText, PALETTE_LIGHT, SIGN_FONT_WEIGHT, type MeasureText, type StickmanPalette } from "./sign";

export interface StickmanSvgOptions {
  pose: Pose;
  /** Čas v ms; bez něj klidová póza. */
  t?: number;
  signColor: SignColor;
  /** Text cedule (už schválený). Prázdný = cedule bez textu. U `none` (bez cedule) se nekreslí. */
  signText: string;
  /** CSS font-family. Výchozí Mona Sans Expanded (v prohlížeči `var(--font-wide)`). */
  fontFamily?: string;
  /** Výchozí světlý motiv v hex (server). V prohlížeči PALETTE_CSS. */
  palette?: StickmanPalette;
  /** Vlastní měření textu (canvas v prohlížeči). */
  measure?: MeasureText;
  /** Přístupný popis; bez něj je SVG dekorativní (aria-hidden). */
  title?: string;
  /** Atributy width/height (jinak jen viewBox). */
  width?: number;
  height?: number;
}

export const DEFAULT_SIGN_FONT = "'Mona Sans Expanded', 'Arial Black', Arial, sans-serif";

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};
export const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Rozložení cedule a textu v souřadnicích SVG – pro next/og, kde se text může sázet zvlášť. */
export function stickmanLayout(
  params: StickmanParams,
  opts: { pose: Pose; t?: number; signText: string; measure?: MeasureText; signColor?: SignColor },
) {
  const fig = figureGeometry(params, poseAt(params, opts.pose, opts.t, opts.signColor === undefined || hasSign(opts.signColor)));
  const k = fig.scale;
  const sg = fig.sign;
  const text = sg ? layoutSignText(opts.signText, params.signShape, opts.measure) : null;
  return {
    figure: fig,
    viewBox: VIEWBOX,
    /** null = panáček bez cedule. */
    text:
      sg && text
        ? {
            lines: text.lines,
            fontSize: text.fontSize * k,
            lineHeight: text.lineHeight * k,
            /** Střed textového bloku = střed cedule; natočení = fig.sign.angle. */
            x: sg.x,
            y: sg.y,
            angle: sg.angle,
          }
        : null,
  };
}

function style(fill: string, stroke?: string, width?: number) {
  return `fill:${fill}${stroke ? `;stroke:${stroke}` : ""}${width !== undefined ? `;stroke-width:${n(width)}` : ""}`;
}

/** Tělo panáčka (bez obalu <svg>) – použitelné i jako <g> ve větším SVG. */
export function figureSvg(fig: Figure, o: { signColor: SignColor; signText: string; fontFamily?: string; palette?: StickmanPalette; measure?: MeasureText; signShape: StickmanParams["signShape"] }): string {
  const pal = o.palette ?? PALETTE_LIGHT;
  const out: string[] = [];
  out.push(`<g style="fill:none;stroke:${pal.ink};stroke-width:${STROKE};stroke-linecap:square;stroke-linejoin:miter">`);
  // Tyče a cedule za tělem.
  for (const p of fig.poles) out.push(`<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}"/>`);
  const sg = fig.sign;
  const paint = hasSign(o.signColor) ? o.signColor : null;
  if (sg && paint) {
  out.push(`<g transform="translate(${n(sg.x)} ${n(sg.y)}) rotate(${n(sg.angle)})">`);
  out.push(`<rect x="${n(-sg.w / 2)}" y="${n(-sg.h / 2)}" width="${n(sg.w)}" height="${n(sg.h)}" style="${style(pal.signFill[paint])}"/>`);
  if (o.signText.trim()) {
    const lay = layoutSignText(o.signText, o.signShape, o.measure);
    const k = fig.scale;
    const fs = lay.fontSize * k;
    const lh = lay.lineHeight * k;
    const top = -((lay.lines.length - 1) * lh) / 2;
    const fam = o.fontFamily ?? DEFAULT_SIGN_FONT;
    out.push(
      `<text text-anchor="middle" dominant-baseline="central" style="stroke:none;fill:${pal.signText[paint]};font-family:${escapeXml(fam)};font-weight:${SIGN_FONT_WEIGHT};font-size:${n(fs)}px">`,
    );
    lay.lines.forEach((line, i) => out.push(`<tspan x="0" y="${n(top + i * lh)}">${escapeXml(line)}</tspan>`));
    out.push(`</text>`);
  }
  out.push(`</g>`);
  }
  // Tělo jednou cestou.
  out.push(`<path d="${fig.body.map((s) => `M${n(s.x1)} ${n(s.y1)}L${n(s.x2)} ${n(s.y2)}`).join("")}"/>`);
  if (fig.fist) {
    const f = fig.fist;
    out.push(`<rect x="${n(f.x - f.size / 2)}" y="${n(f.y - f.size / 2)}" width="${n(f.size)}" height="${n(f.size)}" style="${style(pal.ink)}"/>`);
  }
  if (fig.keys) {
    // Svazek klíčů (póza „klice“): kroužek a tři klíče, tenčí čára v --ink.
    const k = fig.keys;
    out.push(
      `<g transform="translate(${n(k.x)} ${n(k.y)}) rotate(${n(k.angle)}) scale(${n(fig.scale)})" style="stroke-width:${KEYS_STROKE}"><circle r="${KEYS_RING_R}"/><path d="${KEYS_PATH}"/></g>`,
    );
  }
  if (fig.scarf) {
    const sc = scarfShapes(fig.scarf, fig.scale);
    const third = sc.band.h / 3;
    const tt = sc.tail.h / 3;
    out.push(`<g transform="translate(${n(fig.scarf.x)} ${n(fig.scarf.y)}) rotate(${n(fig.scarf.angle)})" style="stroke:none">`);
    // Pruhy shora: bílá, červená, modrá – kolem krku i na visícím konci.
    [pal.tricolor.white, pal.tricolor.red, pal.tricolor.blue].forEach((c, i) => {
      out.push(`<rect x="${n(sc.band.x)}" y="${n(sc.band.y + i * third)}" width="${n(sc.band.w)}" height="${n(third)}" style="fill:${c}"/>`);
      out.push(`<rect x="${n(sc.tail.x)}" y="${n(sc.tail.y + i * tt)}" width="${n(sc.tail.w)}" height="${n(tt)}" style="fill:${c}"/>`);
    });
    out.push(
      `<path d="M${n(sc.band.x)} ${n(sc.band.y)}h${n(sc.band.w)}v${n(sc.band.h)}h${n(-sc.band.w)}ZM${n(sc.tail.x)} ${n(sc.tail.y)}h${n(sc.tail.w)}v${n(sc.tail.h)}h${n(-sc.tail.w)}Z" style="fill:none;stroke:${pal.ink};stroke-width:1"/>`,
    );
    out.push(`</g>`);
  }
  // Hlava (kruh je povolená výjimka – je to postava) s vlasy/pokrývkou.
  const h = fig.head;
  const k = h.r / 8;
  out.push(`<g transform="translate(${n(h.x)} ${n(h.y)}) rotate(${n(h.angle)}) scale(${n(k)})" style="stroke-width:${n(STROKE / k)}">`);
  out.push(`<circle r="8" style="fill:${pal.surface}"/>`);
  for (const part of HAIR_PATHS[fig.hair]) {
    out.push(part.fill ? `<path d="${part.d}" style="fill:${pal.ink};stroke:none"/>` : `<path d="${part.d}"/>`);
  }
  if (fig.glasses) out.push(`<path d="${GLASSES_PATH}" style="stroke-width:${n(1.5 / k)}"/>`);
  out.push(`</g>`);
  out.push(`</g>`);
  return out.join("");
}

/**
 * Čistá funkce: parametry panáčka → SVG řetězec. Funguje na serveru (next/og) i v Reactu.
 * Čáry v --ink, jednotná tloušťka, ostré konce, bez stínování; cedule s ostrými rohy.
 */
export function stickmanSvg(params: StickmanParams, opts: StickmanSvgOptions): string {
  const fig = figureGeometry(params, poseAt(params, opts.pose, opts.t, hasSign(opts.signColor)));
  const vb = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`;
  const size = `${opts.width ? ` width="${opts.width}"` : ""}${opts.height ? ` height="${opts.height}"` : ""}`;
  const a11y = opts.title ? ` role="img" aria-label="${escapeXml(opts.title)}"` : ` aria-hidden="true"`;
  const title = opts.title ? `<title>${escapeXml(opts.title)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size}${a11y}>${title}${figureSvg(fig, {
    signColor: opts.signColor,
    signText: opts.signText,
    fontFamily: opts.fontFamily,
    palette: opts.palette,
    measure: opts.measure,
    signShape: params.signShape,
  })}</svg>`;
}
