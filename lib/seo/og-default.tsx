import { ImageResponse } from "next/og";
import { ui } from "@/lib/content";
import { loadOgFonts } from "@/lib/share/og";
import { COLORS, OG_SIZE } from "@/lib/share/style";
import { seoTexts } from "./texts";

/**
 * Výchozí sdílecí obrázek webu 1200×630 (app/opengraph-image.tsx, app/twitter-image.tsx) –
 * náhled ve vyhledávačích a sítích u stránek bez vlastního obrázku. Stejný jazyk jako sdílecí
 * obrázky momentů (lib/share/og.tsx): noční plocha, celá vlajka 3:2 s obrysem a volným okolím,
 * nadpis Mona Sans Expanded 800. Vlajka je jediný červený prvek. Bez panáčků a cedulí.
 */
const WIDE = "Mona Sans Expanded";
const SANS = "Mona Sans";
const FLAG_W = 240;

export function DefaultOgCard({ kicker, headline, brand, host }: { kicker: string; headline: string; brand: string; host: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: COLORS.night,
        color: COLORS.onNight,
        padding: 72,
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", border: `2px solid ${COLORS.onNight}` }}>
          <svg width={FLAG_W} height={(FLAG_W * 2) / 3} viewBox="0 0 900 600">
            <rect x="0" y="0" width="900" height="300" fill={COLORS.flagWhite} />
            <rect x="0" y="300" width="900" height="300" fill={COLORS.flagRed} />
            <path d="M0 0L450 300 0 600z" fill={COLORS.flagBlue} />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 28 }}>{brand}</div>
          <div style={{ display: "flex", fontWeight: 600, fontSize: 22, marginTop: 8, color: COLORS.nightAccent }}>{host}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 20, letterSpacing: 2, color: COLORS.nightAccent }}>
          {kicker.toUpperCase()}
        </div>
        <div style={{ display: "flex", fontFamily: WIDE, fontWeight: 800, fontSize: 64, lineHeight: 1.06, letterSpacing: -1.5, marginTop: 16, maxWidth: 1000 }}>
          {headline}
        </div>
      </div>
    </div>
  );
}

/** Host bez protokolu pro patičku obrázku (např. obcansky-kompas.vercel.app). */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export async function renderDefaultOg(site: string): Promise<ImageResponse> {
  const t = seoTexts();
  return new ImageResponse(<DefaultOgCard kicker={ui.home.kicker} headline={ui.home.title} brand={t.site_name} host={hostOf(site)} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
