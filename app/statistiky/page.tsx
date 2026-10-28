import type { Metadata } from "next";
import { StatsExplorer } from "@/components/stats/stats-explorer";
import { TextLink } from "@/components/ui/button";
import { SampleBanner } from "@/components/ui/sample";
import { ScreenHeading, SectionTitle } from "@/components/ui/typography";
import { ui } from "@/lib/content";
import { flags } from "@/lib/env";
import { getStats } from "@/lib/stats/source";

export const metadata: Metadata = { title: ui.stats.meta_title };
/** ISR: do DB max. jeden dotaz za minutu (SPEC §14.2). */
export const revalidate = 60;

export default async function StatsPage() {
  const stats = await getStats({});
  return (
    <div className="k-wrap pb-6 pt-3 lg:pt-5">
      <div className="max-w-main">
        <ScreenHeading title={ui.stats.title} lead={ui.stats.lead} />
        {flags.showDemoBar() && (
          <div className="mt-3">
            <SampleBanner title={ui.demo.banner_title} text={ui.demo.banner_text} />
          </div>
        )}
        <StatsExplorer initial={stats} />
        <section className="mt-4 border-t-2 border-ink pt-3" aria-labelledby="h-open-data">
          <SectionTitle id="h-open-data">{ui.stats.open_data_title}</SectionTitle>
          <p className="k-lede">{ui.stats.open_data_lead}</p>
          <TextLink href="/api/open-data" icon="download" download className="mt-1">
            {ui.stats.open_data_button}
          </TextLink>
        </section>
      </div>
    </div>
  );
}
