import type { Metadata } from "next";
import { Compass } from "@/components/compass/compass";
import { StanceBlock } from "@/components/stance-block";
import { ui } from "@/lib/content";

export const metadata: Metadata = { title: ui.compass.meta_title };

/** Kompas běží celý v prohlížeči (SPEC §5.4, §14.2) – stránka je statická. */
export default function CompassPage() {
  return (
    <>
      <Compass />
      <div className="mt-6">
        <StanceBlock />
      </div>
    </>
  );
}
