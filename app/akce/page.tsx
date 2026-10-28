import type { Metadata } from "next";
import { LettersTool } from "@/components/akce/letters-tool";
import { loadAkceDirectories } from "@/components/akce/load-directories";
import { loadUiAkce } from "@/components/akce/load-texts";
import { loadLettersContent } from "@/lib/letters/load";

/**
 * /akce – dopisy zástupcům (SPEC §9.2). Stránka je statická: šablony dopisů a malé adresáře
 * jdou jako props, obce se stahují po krajích. Dopisy, PDF a ZIP vznikají v prohlížeči;
 * server dostane jen anonymní událost letter_prepared (typ adresáta).
 */
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return { title: loadUiAkce().akce.meta_title };
}

export default function AkcePage() {
  return <LettersTool texts={loadUiAkce().akce} letters={loadLettersContent()} dirs={loadAkceDirectories()} />;
}
