import type { Metadata } from "next";
import { CrowdView } from "@/components/demonstrace/crowd/crowd-view";
import { DemoShareProvider } from "@/components/share/demonstrace-share-context";
import { demoShareConfig } from "@/lib/share/demonstrace-data";
import { ui } from "@/lib/content";
import { crowdPresets } from "@/lib/crowd/presets";
import { crowdTexts } from "@/lib/crowd/texts";
import { demoSlogans } from "@/lib/demo/slogans";
import { flags } from "@/lib/env";

/** Stránka je statická (texty z repa); data davu si klient bere z cachovaného API (§6.4). */
export function generateMetadata(): Metadata {
  const t = crowdTexts();
  return { title: t.meta_title, description: t.meta_description, alternates: { canonical: "/demonstrace" } };
}

export default function DemonstracePage() {
  return (
    <DemoShareProvider config={demoShareConfig()}>
    <CrowdView
      texts={crowdTexts()}
      presets={crowdPresets()}
      defaultPreset={demoSlogans.default}
      fixtureTexts={demoSlogans.custom_seed_examples}
      sample={{ show: flags.showDemoBar(), title: ui.demo.banner_title, text: ui.demo.banner_text }}
      joinHref="/demonstrace/pripojit"
      listHref="/demonstrace/seznam"
    />
    </DemoShareProvider>
  );
}
