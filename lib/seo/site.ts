import type { Metadata } from "next";

/**
 * Adresa webu pro metadataBase, kanonické odkazy, sitemap a robots (NEXT_PUBLIC_SITE_URL,
 * bez koncového lomítka). Bez proměnné localhost – v produkci je nastavená (HANDOFF.md).
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Veřejné statické stránky – jediný seznam pro sitemap.xml. Nikdy sem nepatří osobní a tokenové
 * stránky (/v/*, /overeni/*, /org/*, /kompas/podpis*, /demonstrace/pripojit, /demonstrace/[id]) ani API.
 */
export const PUBLIC_PAGES = [
  "/",
  "/kompas",
  "/statistiky",
  "/akce",
  "/fotka",
  "/demonstrace",
  "/demonstrace/seznam",
  "/hnuti",
  "/metodika",
  "/metodika/zdroje",
  "/souvisejici",
  "/o-projektu",
  "/soukromi",
] as const;

export type PublicPage = (typeof PUBLIC_PAGES)[number];

/**
 * Cesty, které vyhledávače nemají procházet (robots.txt). Stránky samy mají navíc `noindex`.
 * /api/og/ zůstává povolené: sdílecí obrázky stahují roboti sociálních sítí.
 */
export const PRIVATE_PATHS = ["/api/", "/v/", "/overeni/", "/org/", "/kompas/podpis", "/demonstrace/pripojit"] as const;

/**
 * Titulek, popis a kanonická adresa veřejné stránky. Kanonická adresa je relativní – doplní ji
 * metadataBase z layoutu. Bez query (?s=, ?r=, ?sig=), takže sdílené varianty míří na jednu stránku.
 */
export function pageMetadata(path: PublicPage, title: string | undefined, description: string): Metadata {
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
  };
}
