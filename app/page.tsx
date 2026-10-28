import { HeroDemo } from "@/components/home/hero-demo";
import { StanceBlock } from "@/components/stance-block";
import { QuestionChart } from "@/components/stats/stats-charts";
import { ButtonLink, StickyBar, TextLink } from "@/components/ui/button";
import { FlagHero } from "@/components/ui/flag";
import { formatCz } from "@/components/ui/format";
import { SampleBanner } from "@/components/ui/sample";
import { Kicker } from "@/components/ui/typography";
import { ui } from "@/lib/content";
import { flags } from "@/lib/env";
import { getStats } from "@/lib/stats/source";

/** Hlavní stránka (SPEC §13), ISR po 60 s (SPEC §14.2). Červený prvek obrazovky = vlajka. */
export const revalidate = 60;

export default async function HomePage() {
  const stats = await getStats({});
  return (
    <div>
      {/* Plakát: noční plocha (hlavička nad ní přejde do noční přes data-night-top). */}
      <section className="k-night" data-night-top aria-labelledby="h-home">
        {/* Mobil: vlajka → otázka → dav. Desktop: otázka vlevo, vpravo vlajka a pod ní (s odstupem) dav. */}
        <div className="k-wrap grid pb-5 pt-5 lg:grid-cols-[minmax(0,1fr)_440px] lg:grid-rows-[auto_auto] lg:items-center lg:gap-x-12 lg:pb-10 lg:pt-9">
          <div className="lg:col-start-2 lg:row-start-1 lg:flex lg:justify-center lg:self-end">
            <div className="mb-5 ml-1.5 w-[120px] lg:m-0 lg:w-[240px]">
              <FlagHero label="" />
            </div>
          </div>
          <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <Kicker>{ui.home.kicker}</Kicker>
            <h1 id="h-home" className="k-h k-display">
              {ui.home.title}
            </h1>
            <p className="k-lede mt-2 lg:mt-3 lg:text-[20px] lg:leading-[28px]">{ui.home.lead}</p>
            <div className="mt-5 hidden w-[360px] md:block">
              <ButtonLink href="/kompas" block iconEnd="arrow-right">
                {ui.home.start_button}
              </ButtonLink>
            </div>
          </div>
          <div className="mt-4 lg:col-start-2 lg:row-start-2 lg:mt-12 lg:self-start">
            <HeroDemo label={ui.home.demo_aria} className="mx-auto max-w-[400px] lg:max-w-none" />
            <TextLink href="/demonstrace" icon="arrow-right" className="mt-2 inline-flex min-h-[48px] items-center">
              {ui.home.demo_button}
            </TextLink>
          </div>
        </div>
      </section>

      <div className="lg:mx-auto lg:grid lg:max-w-page lg:px-6 lg:grid-cols-2 lg:gap-6 lg:py-6">
        <StanceBlock />

        <section className="k-wrap pb-4 pt-4 lg:p-0" aria-labelledby="h-home-stats">
          {flags.showDemoBar() && (
            <div className="mb-4">
              <SampleBanner title={ui.demo.banner_title} text={ui.demo.banner_text} />
            </div>
          )}
          {stats ? (
            <>
              <p id="h-home-stats" className="k-stat mb-4">
                <span className="k-stat-xl">{formatCz(stats.verified)}</span>
                <span className="k-kicker basis-full">{ui.home.count_label}</span>
              </p>
              {stats.verified > 0 && <QuestionChart stats={stats} qid="q2" headingLevel={2} />}
              <TextLink href="/statistiky" icon="arrow-right" className="mt-2">
                {ui.home.stats_button}
              </TextLink>
            </>
          ) : (
            <p id="h-home-stats" className="text-ink-secondary">
              {ui.stats.unavailable}
            </p>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-rule-soft pt-2">
            <span>{ui.home.method_line}</span>
            <TextLink href="/metodika" icon="arrow-right">
              {ui.home.method_button}
            </TextLink>
          </p>
        </section>
      </div>

      {/* Mobil: jediná primární akce přilepená dole. */}
      <div className="k-wrap sticky bottom-0 z-30 md:hidden">
        <StickyBar>
          <ButtonLink href="/kompas" block iconEnd="arrow-right">
            {ui.home.start_button}
          </ButtonLink>
        </StickyBar>
      </div>
    </div>
  );
}
