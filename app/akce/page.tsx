import type { Metadata } from "next";
import { LettersTool } from "@/components/akce/letters-tool";
import { loadAkceDirectories } from "@/components/akce/load-directories";
import { loadUiAkce } from "@/components/akce/load-texts";
import { ShareArrival } from "@/components/share/share-arrival";
import { AnswersLoaderRemount } from "@/components/lookup/answers-loader-link";
import { lookupTexts } from "@/lib/sign/lookup-texts";
import { loadLettersContent } from "@/lib/letters/load";
import { shareMetadata } from "@/lib/share/metadata";
import { parseRecipients } from "@/lib/share/moments";
import { sharePanelTexts, shareTexts } from "@/lib/share/texts";

/**
 * /akce – dopisy zástupcům (SPEC §9.2). Stránka je statická: šablony dopisů a malé adresáře
 * jdou jako props, obce se stahují po krajích. Dopisy, PDF a ZIP vznikají v prohlížeči;
 * server dostane jen anonymní událost letter_prepared (typ adresáta).
 */
export const dynamic = "force-static";

type Props = { searchParams: Promise<{ r?: string | string[] }> };

/**
 * Sdílený odkaz nese `?r=poslanec:3,…` (počty dopisů podle typu adresáta) pro OG obrázek.
 * Pozor: při `force-static` jsou searchParams prázdné, takže metadata dostanou obecný obrázek
 * „dopisy“ bez počtů. Stránku necháváme statickou (velké props, CDN); obrázek s počty by
 * vyžadoval dynamické vykreslení /akce (nebo přepis v proxy).
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { r } = await searchParams;
  return { title: loadUiAkce().akce.meta_title, ...shareMetadata("dopisy", { recipients: parseRecipients(Array.isArray(r) ? r[0] : r) }) };
}

export default function AkcePage() {
  const s = shareTexts().share;
  return (
    <>
      <ShareArrival />
      {/* „Načíst moje odpovědi“ (číslo podpisu / odkaz z e-mailu): po načtení se nástroj znovu připojí. */}
      <AnswersLoaderRemount texts={lookupTexts()}>
        <LettersTool
          texts={loadUiAkce().akce}
          letters={loadLettersContent()}
          dirs={loadAkceDirectories()}
          share={{ panel: sharePanelTexts(), image: s.image, recipients: s.recipients }}
        />
      </AnswersLoaderRemount>
    </>
  );
}
