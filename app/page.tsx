import Link from "next/link";
import { DemoBar } from "@/components/demo-bar";
import { Flag } from "@/components/flag";
import { StanceBlock } from "@/components/stance-block";
import { QuestionChart } from "@/components/stats/stats-charts";
import { buttonPrimary, buttonLink } from "@/components/sticky-action";
import { ui } from "@/lib/content";
import { flags } from "@/lib/env";
import { getStats } from "@/lib/stats/source";

/** Hlavní stránka (SPEC §13), ISR po 60 s (SPEC §14.2). */
export const revalidate = 60;

export default async function HomePage() {
  const stats = await getStats({});
  return (
    <>
      {flags.showDemoBar() && <DemoBar />}
      <section className="mx-auto max-w-5xl px-4 pb-12 pt-8 md:pt-16">
        <Flag animate className="h-auto w-40 md:w-56" />
        <h1 className="mt-8 max-w-3xl text-[2.5rem] font-bold leading-[1.05] md:text-6xl">{ui.home.title}</h1>
        <p className="mt-4 max-w-2xl text-xl text-muted">{ui.home.lead}</p>
        <Link href="/kompas" className={`${buttonPrimary} mt-8 w-full no-underline sm:w-auto`}>
          {ui.home.start_button}
        </Link>
      </section>

      <StanceBlock />

      <section className="mx-auto max-w-3xl px-4 py-12" aria-labelledby="h-home-stats">
        {stats ? (
          <>
            <p id="h-home-stats" className="flex flex-col">
              <span className="tabular text-6xl font-bold leading-none">{stats.verified.toLocaleString("cs-CZ")}</span>
              <span className="mt-2 text-xl">{ui.home.count_label}</span>
            </p>
            {stats.verified > 0 && (
              <div className="mt-8">
                <QuestionChart stats={stats} qid="q2" />
              </div>
            )}
            <Link href="/statistiky" className={`${buttonLink} mt-4`}>
              {ui.home.stats_button}
            </Link>
          </>
        ) : (
          <p id="h-home-stats" className="text-muted">
            {ui.stats.unavailable}
          </p>
        )}
      </section>

      <section className="border-t-2 border-ink">
        <p className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 px-4 py-6">
          <span>{ui.home.method_line}</span>
          <Link href="/metodika" className={buttonLink}>
            {ui.home.method_button}
          </Link>
        </p>
      </section>
    </>
  );
}
