import { ImageResponse } from "next/og";
import type { ShareCard } from "./card";
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

export async function renderOg(card: ShareCard, cacheControl: string): Promise<Response> {
  const fonts = await loadOgFonts();
  return new ImageResponse(<OgCard card={card} />, {
    ...OG_SIZE,
    fonts,
    headers: { "cache-control": cacheControl },
  });
}
