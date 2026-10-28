import type { Metadata } from "next";
import { Compass } from "@/components/compass/compass";
import { StanceBlock } from "@/components/stance-block";
import { ui } from "@/lib/content";
import { lookupTexts } from "@/lib/sign/lookup-texts";
import { pageMetadata } from "@/lib/seo/site";
import { seoTexts } from "@/lib/seo/texts";

export function generateMetadata(): Metadata {
  return pageMetadata("/kompas", ui.compass.meta_title, seoTexts().descriptions.kompas);
}

/** Kompas běží celý v prohlížeči (SPEC §5.4, §14.2) – stránka je statická. */
export default function CompassPage() {
  return (
    <>
      <Compass lookup={lookupTexts()} />
      <div className="mt-6">
        <StanceBlock />
      </div>
    </>
  );
}
