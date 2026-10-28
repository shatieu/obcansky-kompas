import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ui } from "@/lib/content";
import { siteUrl } from "@/lib/seo/site";
import { seoTexts } from "@/lib/seo/texts";
import "./globals.css";

/* Mona Sans (GitHub, OFL) – self-hosted, soubory obsahují latin + latin-ext (česká diakritika). */
const mona = localFont({
  src: [
    { path: "./fonts/MonaSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/MonaSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/MonaSans-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mona",
  display: "swap",
  // Přednačítá se jen široký řez (nadpisy = LCP na / i /kompas). Text (3 řezy, 81 kB) se stáhne hned
  // po CSS a do té doby ho kreslí metricky upravený záložní font – nekonkuruje JS na pomalé síti.
  preload: false,
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});
const monaWide = localFont({
  src: [
    { path: "./fonts/MonaSansExpanded-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/MonaSansExpanded-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-mona-wide",
  display: "swap",
  fallback: ["Arial Black", "sans-serif"],
});

/**
 * Výchozí metadata (vyhledávače, sdílení). Stránky dodávají jen krátký titulek (šablona připojí název
 * webu), popis a kanonickou adresu (lib/seo/site.ts). Ikony, manifest a výchozí OG obrázek jsou
 * souborové konvence v app/ (icon.svg, favicon.ico, apple-icon.png, manifest.ts, opengraph-image.tsx).
 * openGraph tu nemá titulek ani popis – Next je doplní z titulku a popisu každé stránky; stránky
 * s vlastním obrázkem (shareMetadata) si openGraph nastavují celé.
 */
const seo = seoTexts();
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: ui.home.meta_title, template: `%s – ${seo.site_name}` },
  description: ui.home.meta_description,
  applicationName: seo.site_name,
  openGraph: { type: "website", locale: "cs_CZ", siteName: seo.site_name },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs" className={`${mona.variable} ${monaWide.variable}`}>
      <body className="flex min-h-dvh flex-col bg-surface text-ink antialiased">
        <a
          href="#obsah"
          className="sr-only focus:not-sr-only focus:absolute focus:left-1 focus:top-1 focus:z-50 focus:bg-surface focus:p-2"
        >
          {ui.site.skip_link}
        </a>
        <SiteHeader />
        <main id="obsah" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
