import type { Metadata } from "next";
import { ScreenHeading } from "@/components/ui/typography";
import { PhotoStudio } from "@/components/photo/photo-studio";
import { ShareArrival } from "@/components/share/share-arrival";
import { loadPhotoUi, loadSlogans } from "@/lib/photo/content";
import { shareMetadata } from "@/lib/share/metadata";
import { sharePanelTexts, shareTexts } from "@/lib/share/texts";

const ui = loadPhotoUi();

export const metadata: Metadata = { title: ui.meta_title, description: ui.meta_description, ...shareMetadata("fotka") };

/**
 * /fotka (SPEC §9.3): rámeček na profilovou fotku. Stránka je statická, vše se
 * počítá v prohlížeči (canvas). Fotka nikdy neopustí prohlížeč; server dostane jen
 * anonymní událost `frame_downloaded` (varianta, slogan) po stažení.
 */
export default function PhotoPage() {
  return (
    <div className="k-wrap">
      <div className="mx-auto flex w-full max-w-main flex-col gap-3 pt-3 pb-3 lg:pt-6">
        <ScreenHeading kicker={ui.kicker} title={ui.title} lead={ui.lead} />
        <ShareArrival />
        <PhotoStudio ui={ui} slogans={loadSlogans()} share={{ panel: sharePanelTexts(), image: shareTexts().share.image }} />
      </div>
    </div>
  );
}
