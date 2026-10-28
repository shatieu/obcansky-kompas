import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ui } from "@/lib/content";
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: ui.home.meta_title,
  description: ui.home.meta_description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1B33" },
  ],
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
