import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CrowdView } from "@/components/demonstrace/crowd/crowd-view";
import { DemoShareProvider } from "@/components/share/demonstrace-share-context";
import { demoShareConfig, demoShareMetadata } from "@/lib/share/demonstrace-data";
import { ui } from "@/lib/content";
import { crowdPresets } from "@/lib/crowd/presets";
import { crowdTexts } from "@/lib/crowd/texts";
import { demoSlogans } from "@/lib/demo/slogans";
import { flags } from "@/lib/env";

/** id panáčka: uuid, nebo `fixture-N` (vývojová ukázka bez API). */
const ID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|fixture-\d{1,7})$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const t = crowdTexts();
  const base: Metadata = { title: t.meta_title, description: t.meta_description, robots: { index: false, follow: true } };
  // Sdílený odkaz → OG obrázek panáčka (SPEC-demonstrace §8), jen veřejná data.
  const { id } = await params;
  return { ...base, ...(await demoShareMetadata(id)) };
}

/**
 * /demonstrace/[id] – dav vycentrovaný na panáčka s otevřenou kartou (SPEC-demonstrace §2).
 * Data panáčka načte klient z /api/demonstrace/[id] (cache), stránka sama do DB nesahá.
 */
export default async function DemonstracePersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) notFound();
  return (
    <DemoShareProvider config={demoShareConfig()}>
    <CrowdView
      texts={crowdTexts()}
      presets={crowdPresets()}
      defaultPreset={demoSlogans.default}
      fixtureTexts={demoSlogans.custom_seed_examples}
      focusId={id}
      sample={{ show: flags.showDemoBar(), title: ui.demo.banner_title, text: ui.demo.banner_text }}
      joinHref="/demonstrace/pripojit"
      listHref="/demonstrace/seznam"
    />
    </DemoShareProvider>
  );
}
