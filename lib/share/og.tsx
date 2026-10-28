import { ImageResponse } from "next/og";
import { generateStickman } from "@/lib/stickman/params";
import { poseAt } from "@/lib/stickman/poses";
import { figureGeometry } from "@/lib/stickman/geometry";
import { stickmanLayout, figureSvg } from "@/lib/stickman/svg";
import type { ShareCard, ShareFigure } from "./card";
import { CROWD_PALETTE, demoScene, FG_PALETTE, type Box, type Placed } from "./demonstrace";
import { COLORS, OG_SIZE } from "./style";

/**
 * OG obrázek 1200×630 přes next/og (SPEC §9.4), podle design systému (ShareImage, formát og):
 * noční plocha, celá vlajka 3:2 vlevo nahoře s obrysem a volným okolím, nápis vpravo,
 * nadpis Mona Sans Expanded 800, volby v bílých polích s modrým číslem.
 * Písmo: Mona Sans (OFL) jako TTF podmnožina (next/og neumí WOFF2).
 */

function fromBase64(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

let fontsPromise: Promise<{ name: string; data: ArrayBuffer; weight: 600 | 800; style: "normal" }[]> | null = null;

export function loadOgFonts() {
  fontsPromise ??= Promise.all([import("./fonts/mona-sans-expanded-extrabold"), import("@/lib/export/fonts/mona-sans-semibold")]).then(
    ([wide, sans]) => [
      { name: "Mona Sans Expanded", data: fromBase64(wide.FONT_BASE64), weight: 800 as const, style: "normal" as const },
      { name: "Mona Sans", data: fromBase64(sans.FONT_BASE64), weight: 600 as const, style: "normal" as const },
    ],
  );
  return fontsPromise;
}

const WIDE = "Mona Sans Expanded";
const SANS = "Mona Sans";

/** Celá vlajka 3:2 (viewBox 900×600), obrys 2 px vně, nic přes ni. */
function Flag({ width }: { width: number }) {
  const h = (width * 2) / 3;
  return (
    <div style={{ display: "flex", border: `2px solid ${COLORS.onNight}` }}>
      <svg width={width} height={h} viewBox="0 0 900 600">
        <rect x="0" y="0" width="900" height="300" fill={COLORS.flagWhite} />
        <rect x="0" y="300" width="900" height="300" fill={COLORS.flagRed} />
        <path d="M0 0L450 300 0 600z" fill={COLORS.flagBlue} />
      </svg>
    </div>
  );
}

function headlineSize(card: ShareCard): number {
  const len = card.headline.length;
  if (card.big) return len > 40 ? 40 : 48;
  if (card.items.length || card.line) return len > 52 ? 44 : 54;
  return len > 52 ? 52 : 62;
}

export function OgCard({ card }: { card: ShareCard }) {
  const hs = headlineSize(card);
  const items = card.items.slice(0, card.numbered ? 3 : 6);
  const compact = items.length > 3;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: COLORS.night,
        color: COLORS.onNight,
        padding: 64,
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Flag width={180} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: 640 }}>
          <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 24 }}>{card.brand}</div>
          {card.name && (
            <div style={{ display: "flex", marginTop: 10, fontWeight: 600, fontSize: 24, textAlign: "right" }}>{card.name}</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "flex-end", paddingBottom: items.length ? 28 : 0 }}>
        {card.kicker && (
          <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 18, letterSpacing: 2, color: COLORS.nightAccent }}>
            {card.kicker}
          </div>
        )}
        {card.big && (
          <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 150, lineHeight: 1, letterSpacing: -4, marginTop: 8 }}>
            {card.big}
          </div>
        )}
        <div
          style={{
            display: "flex",
            fontFamily: WIDE,
            fontWeight: 800,
            fontSize: hs,
            lineHeight: 1.08,
            letterSpacing: -1.5,
            marginTop: card.kicker || card.big ? 12 : 0,
          }}
        >
          {card.headline}
        </div>
        {card.line && <div style={{ display: "flex", fontWeight: 600, fontSize: 26, lineHeight: 1.3, marginTop: 14 }}>{card.line}</div>}
      </div>

      {items.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 12 : 16 }}>
          {items.map((it, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: COLORS.flagWhite,
                color: COLORS.night,
                padding: compact ? "10px 16px" : "14px 18px",
                width: compact ? 344 : items.length === 1 ? 700 : (1072 - 16 * (items.length - 1)) / items.length,
              }}
            >
              {card.numbered && (
                <div
                  style={{
                    display: "flex",
                    flexShrink: 0,
                    width: 40,
                    height: 40,
                    alignItems: "center",
                    justifyContent: "center",
                    background: COLORS.flagBlue,
                    color: COLORS.flagWhite,
                    fontFamily: WIDE,
                    fontWeight: 800,
                    fontSize: 20,
                  }}
                >
                  {String(i + 1)}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", flexShrink: 1, minWidth: 0 }}>
                {it.caption && (
                  <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 13, letterSpacing: 1, color: COLORS.inkSecondary }}>
                    {it.caption.toUpperCase()}
                  </div>
                )}
                <div style={{ display: "flex", fontWeight: 600, fontSize: compact || items.length === 3 ? 20 : 22, lineHeight: 1.15 }}>{it.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Online demonstrace (SPEC-demonstrace §8) ---------------- */

const n2 = (v: number) => String(Math.round(v * 100) / 100);

/** Celá scéna (dav + panáček bez textu cedule) jako jedno SVG; text cedule se sází zvlášť (next/og). */
export function sceneSvg(placed: Placed[], box: Box): string {
  const parts = placed.map((p) => {
    const params = generateStickman(p.seed);
    const fig = figureGeometry(params, poseAt(params, p.pose));
    const body = figureSvg(fig, { signColor: p.signColor, signText: "", palette: p.layer === "fg" ? FG_PALETTE : CROWD_PALETTE, signShape: params.signShape });
    return `<g transform="translate(${n2(p.x - box.x)} ${n2(p.y - box.y)}) scale(${n2(p.scale)})">${body}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.w}" height="${box.h}" viewBox="0 0 ${box.w} ${box.h}">${parts.join("")}</svg>`;
}

/** Text cedule panáčka v popředí: řádky, střed, natočení a velikost v px (souřadnice boxu). */
export function fgSignText(p: Placed, box: Box) {
  const params = generateStickman(p.seed);
  const lay = stickmanLayout(params, { pose: p.pose, signText: p.signText });
  const fig = lay.figure;
  return {
    lines: lay.text.lines,
    fontSize: lay.text.fontSize * p.scale,
    lineHeight: lay.text.lineHeight * p.scale,
    cx: p.x - box.x + lay.text.x * p.scale,
    cy: p.y - box.y + lay.text.y * p.scale,
    w: fig.sign.w * p.scale,
    h: fig.sign.h * p.scale,
    angle: lay.text.angle,
    color: FG_PALETTE.signText[p.signColor],
  };
}

export const OG_DEMO_BOX: Box = { x: 600, y: 24, w: 576, h: 606 };

function OgScene({ figure }: { figure: ShareFigure }) {
  const box = OG_DEMO_BOX;
  const placed = demoScene(figure, box);
  const fg = placed[placed.length - 1]!;
  const svg = sceneSvg(placed, box);
  const txt = fg.signText.trim() ? fgSignText(fg, box) : null;
  return (
    <div style={{ display: "flex", position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={box.w} height={box.h} alt="" />
      {txt && (
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: txt.cx - txt.w / 2,
            top: txt.cy - txt.h / 2,
            width: txt.w,
            height: txt.h,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: `rotate(${txt.angle}deg)`,
            color: txt.color,
            fontFamily: WIDE,
            fontWeight: 800,
            fontSize: txt.fontSize,
            lineHeight: 1,
          }}
        >
          {txt.lines.map((l, i) => (
            <div key={i} style={{ display: "flex", height: txt.lineHeight, alignItems: "center", whiteSpace: "nowrap" }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OgDemoCard({ card }: { card: ShareCard }) {
  const len = card.headline.length;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: COLORS.night, color: COLORS.onNight, fontFamily: SANS }}>
      {card.figure && <OgScene figure={card.figure} />}
      <div style={{ display: "flex", flexDirection: "column", width: 560, height: "100%", padding: 64 }}>
        <div style={{ display: "flex", alignSelf: "flex-start" }}>
          <Flag width={160} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "flex-end" }}>
          {card.kicker && (
            <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 18, letterSpacing: 2, color: COLORS.nightAccent }}>{card.kicker}</div>
          )}
          <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: len > 44 ? 40 : 46, lineHeight: 1.08, letterSpacing: -1.2, marginTop: 12 }}>
            {card.headline}
          </div>
          {card.line && <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 30, marginTop: 18 }}>{card.line}</div>}
          {card.name && <div style={{ display: "flex", fontWeight: 600, fontSize: 24, marginTop: 14 }}>{card.name}</div>}
          <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 20, marginTop: 24 }}>{card.brand}</div>
        </div>
      </div>
    </div>
  );
}

export async function renderOg(card: ShareCard, cacheControl: string): Promise<Response> {
  const fonts = await loadOgFonts();
  return new ImageResponse(card.figure ? <OgDemoCard card={card} /> : <OgCard card={card} />, {
    ...OG_SIZE,
    fonts,
    headers: { "cache-control": cacheControl },
  });
}
