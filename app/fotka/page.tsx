import type { Metadata } from "next";
import { PhotoStudio } from "@/components/photo/photo-studio";
import { loadPhotoUi, loadSlogans } from "@/lib/photo/content";

const ui = loadPhotoUi();

export const metadata: Metadata = { title: ui.meta_title, description: ui.meta_description };

/**
 * /fotka (SPEC §9.3): rámeček na profilovou fotku. Stránka je statická, vše se
 * počítá v prohlížeči (canvas). Fotka nikdy neopustí prohlížeč; server dostane jen
 * anonymní událost `frame_downloaded` (varianta, slogan) po stažení.
 */
export default function PhotoPage() {
  return (
    <div className="mx-auto flex w-full max-w-[688px] flex-col gap-[24px] px-[16px] pb-[24px] pt-[24px] md:px-[48px]">
      <header className="flex flex-col gap-[8px]">
        <p className="font-wide text-[13px] font-bold uppercase leading-[16px] tracking-[0.08em]">{ui.kicker}</p>
        <h1 className="font-wide text-[30px] font-extrabold leading-[32px] tracking-[-0.02em] md:text-[48px] md:leading-[50px]">
          {ui.title}
        </h1>
        <p className="text-[17px] leading-[26px]">{ui.lead}</p>
      </header>
      <PhotoStudio ui={ui} slogans={loadSlogans()} />
    </div>
  );
}
