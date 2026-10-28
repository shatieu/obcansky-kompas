import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShareArrival } from "@/components/share/share-arrival";
import { SharePanel } from "@/components/share/share-panel";
import { Icon } from "@/components/ui/icon";
import { SampleBanner } from "@/components/ui/sample";
import { Notice, ScreenHeading, SectionTitle } from "@/components/ui/typography";
import { questionsFile, t as fill, ui } from "@/lib/content";
import { flags } from "@/lib/env";
import { srovnaniCard } from "@/lib/share/card";
import { questionRows, type QuestionRow } from "@/lib/share/compare-view";
import { comparisonFor, getCachedOrganizations, getCachedStats, lookupSignature, skippedQuestions } from "@/lib/share/data";
import { shareMetadata } from "@/lib/share/metadata";
import { shareSentence } from "@/lib/share/moments";
import { sharePanelTexts, shareTexts, type ComparePageTexts } from "@/lib/share/texts";
import { UUID_RE } from "@/lib/sign/input";
import type { OrgComparison } from "@/lib/stats/compare";

/**
 * /v/[uuid]/srovnani (SPEC §8): u každé otázky % ověřených lidí se stejnou odpovědí,
 * shoda se stranami a hnutími (podíl stejných odpovědí bez „Nevím“ a zašedlých, Q1 podle pásma),
 * řazení abecedně. Agregace z cache 60 s, podpis z cache `sig:<uuid>`. Nikdy se neindexuje.
 * Sdílí se jen míra shody s lidmi, nikdy se stranami.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ uuid: string }> };

async function overallFor(uuid: string): Promise<number | null> {
  const found = await lookupSignature(uuid);
  if (found.status !== "ok") return null;
  const stats = await getCachedStats();
  if (!stats) return null;
  return comparisonFor(found.signature.answers, stats, []).overallPercent;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uuid } = await params;
  const t = shareTexts().compare_page;
  const base: Metadata = { title: t.meta_title, robots: { index: false, follow: false } };
  if (!UUID_RE.test(uuid) || flags.staticDemo()) return base;
  const percent = await overallFor(uuid.toLowerCase()).catch(() => null);
  const title = percent === null ? undefined : shareSentence("srovnani", { percent });
  return { ...base, ...shareMetadata("srovnani", { id: uuid.toLowerCase(), title }) };
}

const pct = (n: number) => `${n} %`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="k-wrap">
      <div className="mx-auto w-full max-w-main pt-2 pb-3 lg:pt-4">{children}</div>
    </div>
  );
}

function QuestionItem({ row, t }: { row: QuestionRow; t: ComparePageTexts }) {
  const muted = row.state === "skipped" || row.state === "no_answer";
  return (
    <li className="border-t border-rule-soft py-2">
      <p className="text-small font-semibold text-ink-secondary">{row.question}</p>
      <p className={`mt-0.5 font-semibold ${muted ? "text-ink-secondary" : ""}`}>
        {row.state === "skipped" ? t.skipped : row.answer === null ? t.no_answer : fill(t.your_answer, { answer: row.answer })}
      </p>
      {row.state === "compared" && row.percent !== null && (
        <div className="k-bar mt-1">
          <span className="k-bar__fill" style={{ width: `${row.percent}%` }} />
          <span className="k-bar__text">
            <span>{fill(t.same_answer, { percent: row.percent }).replace(/(\d) %/, "$1 %")}</span>
            <span className="k-bar__val">{fill(t.same_count, { same: row.same, total: row.total })}</span>
          </span>
          <span className="k-bar__text k-bar__text--on" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - row.percent}% 0 0)` }}>
            <span>{fill(t.same_answer, { percent: row.percent }).replace(/(\d) %/, "$1 %")}</span>
            <span className="k-bar__val">{fill(t.same_count, { same: row.same, total: row.total })}</span>
          </span>
        </div>
      )}
      {row.state === "no_data" && <p className="k-cap mt-0.5">{t.no_data}</p>}
    </li>
  );
}

function OrgItem({ org, t }: { org: OrgComparison; t: ComparePageTexts }) {
  let value: string;
  let detail: string | null = null;
  if (!org.answered) value = t.org_not_answered;
  else if (org.percent === null) value = t.org_not_comparable;
  else {
    value = fill(t.org_agreement, { percent: org.percent }).replace(/(\d) %/, "$1 %");
    detail = fill(t.org_detail, { matches: org.matches, compared: org.compared });
  }
  return (
    <li className="flex min-h-answer flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b-2 border-ink py-1.5">
      <span className="font-semibold">{org.name}</span>
      <span className="text-right">
        <span className={`k-num font-wide font-bold ${org.percent === null ? "font-sans font-semibold text-ink-secondary" : ""}`}>{value}</span>
        {detail && <span className="k-cap block">{detail}</span>}
      </span>
    </li>
  );
}

export default async function ComparePage({ params }: Props) {
  const { uuid: raw } = await params;
  const all = shareTexts();
  const t = all.compare_page;
  const demoBar = flags.showDemoBar() ? (
    <div className="k-wrap pt-2">
      <SampleBanner title={ui.demo.banner_title} text={ui.demo.banner_text} />
    </div>
  ) : null;

  if (flags.staticDemo()) {
    return (
      <>
        {demoBar}
        <Shell>
          <Notice tone="info">{t.static_demo}</Notice>
        </Shell>
      </>
    );
  }
  if (!UUID_RE.test(raw)) notFound();
  const uuid = raw.toLowerCase();

  const found = await lookupSignature(uuid);
  if (found.status === "missing") notFound();
  if (found.status !== "ok") {
    const withdrawn = found.status === "withdrawn";
    return (
      <Shell>
        <ScreenHeading kicker={t.kicker} title={withdrawn ? t.withdrawn_title : t.unavailable_title} lead={withdrawn ? t.withdrawn_lead : t.unavailable_lead} />
      </Shell>
    );
  }
  const sig = found.signature;
  const [stats, organizations] = await Promise.all([getCachedStats(), getCachedOrganizations()]);
  if (!stats) {
    return (
      <>
        {demoBar}
        <Shell>
          <ScreenHeading kicker={t.kicker} title={t.unavailable_title} lead={t.unavailable_lead} />
        </Shell>
      </>
    );
  }

  const cmp = comparisonFor(sig.answers, stats, organizations);
  const rows = questionRows(cmp, questionsFile, skippedQuestions(sig.answers));
  const card = srovnaniCard(cmp.overallPercent, all.share.image);

  return (
    <>
      {demoBar}
      <ShareArrival />
      <Shell>
        <a href={`/v/${uuid}`} className="k-back">
          <Icon name="chevron-left" />
          {t.back_button}
        </a>
        <ScreenHeading className="mt-2" kicker={t.kicker} title={t.title} lead={t.lead} />

        <section className="mt-4" aria-labelledby="h-overall">
          <h2 id="h-overall" className="k-kicker">
            {t.overall_label}
          </h2>
          {cmp.overallPercent === null ? (
            <p className="mt-1 font-semibold">{t.overall_none}</p>
          ) : (
            <p className="k-stat mt-1">
              <span className="k-stat-xl text-red">{pct(cmp.overallPercent)}</span>
            </p>
          )}
        </section>

        <ol className="mt-4 border-b border-rule-soft" aria-label={t.lead}>
          {rows.map((r) => (
            <QuestionItem key={r.questionId} row={r} t={t} />
          ))}
        </ol>
        <p className="k-cap mt-1.5">{t.disclaimer}</p>

        {cmp.overallPercent !== null && (
          <div className="mt-4">
            <SharePanel card={card} url={`/v/${uuid}/srovnani`} texts={sharePanelTexts()} buttonLabel={t.share_button} />
          </div>
        )}

        <section className="mt-6" aria-labelledby="h-orgs">
          <SectionTitle id="h-orgs">{t.orgs_title}</SectionTitle>
          <p className="k-cap mt-0.5">{t.orgs_lead}</p>
          {cmp.organizations.length === 0 ? (
            <p className="mt-2">{t.orgs_empty}</p>
          ) : (
            <ul className="mt-2 border-t-2 border-ink">
              {cmp.organizations.map((o) => (
                <OrgItem key={o.name} org={o} t={t} />
              ))}
            </ul>
          )}
        </section>
      </Shell>
    </>
  );
}
