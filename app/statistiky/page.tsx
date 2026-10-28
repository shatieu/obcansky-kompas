import type { Metadata } from "next";
import { DemoBar } from "@/components/demo-bar";
import { StatsExplorer } from "@/components/stats/stats-explorer";
import { buttonSecondary } from "@/components/sticky-action";
import { ui } from "@/lib/content";
import { flags } from "@/lib/env";
import { getStats } from "@/lib/stats/source";

export const metadata: Metadata = { title: ui.stats.meta_title };
/** ISR: do DB max. jeden dotaz za minutu (SPEC §14.2). */
export const revalidate = 60;

export default async function StatsPage() {
  const stats = await getStats({});
  return (
    <>
      {flags.showDemoBar() && <DemoBar />}
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-[2rem] font-bold leading-tight md:text-[2.5rem]">{ui.stats.title}</h1>
        <p className="mt-2 text-muted">{ui.stats.lead}</p>
        <StatsExplorer initial={stats} />
        <section className="mt-12 border-t-2 border-ink pt-4" aria-labelledby="h-open-data">
          <h2 id="h-open-data" className="text-xl font-bold">
            {ui.stats.open_data_title}
          </h2>
          <p className="mt-1 text-muted">{ui.stats.open_data_lead}</p>
          <a href="/api/open-data" className={`${buttonSecondary} mt-4 no-underline`} download>
            {ui.stats.open_data_button}
          </a>
        </section>
      </div>
    </>
  );
}
