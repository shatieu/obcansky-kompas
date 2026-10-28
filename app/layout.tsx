import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ui } from "@/lib/content";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter-tight",
  display: "swap",
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
    <html lang="cs" className={interTight.variable}>
      <body className="flex min-h-dvh flex-col bg-surface text-ink antialiased">
        <a href="#obsah" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-surface focus:p-3">
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
