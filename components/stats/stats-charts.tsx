import { questionsFile, t, ui } from "@/lib/content";
import { QUESTION_ORDER } from "@/lib/compose/order";
import type { QuestionId } from "@/lib/compose/types";
import { chartOrder, type StatsResult } from "@/lib/stats/aggregate";
import { BarChart } from "@/components/ui/bar-chart";
import { formatCz, NB } from "@/components/ui/format";

const label = (id: string) => {
  for (const q of questionsFile.questions) {
    const o = q.options.find((x) => x.id === id);
    if (o) return o.label;
  }
  return id;
};

/** Graf jedné otázky: pruhy v pořadí odpovědí, popisky na pruzích, pod grafem upozornění (SPEC §8). */
export function QuestionChart({ stats, qid, headingLevel = 2 }: { stats: StatsResult; qid: QuestionId; headingLevel?: 2 | 3 }) {
  const q = questionsFile.questions.find((x) => x.id === qid)!;
  const qs = stats.questions[qid];
  return (
    <BarChart
      title={q.text}
      headingLevel={headingLevel}
      total={qs.total}
      lede={t(ui.stats.respondents, { n: formatCz(qs.total) })}
      foot={ui.stats.disclaimer}
      data={chartOrder(questionsFile, qid).map(({ key, label }) => ({ key, label, value: qs.counts[key] ?? 0 }))}
    />
  );
}

export function StatsCharts({ stats }: { stats: StatsResult }) {
  if (stats.verified === 0) return <p className="mt-3 text-ink-secondary">{ui.stats.no_data}</p>;
  return (
    <div>
      {QUESTION_ORDER.map((qid) => (
        <div key={qid} className="border-t border-rule-soft py-3">
          <QuestionChart stats={stats} qid={qid} />
        </div>
      ))}
      {stats.topCombos.length > 0 && (
        <section className="border-t border-rule-soft py-3" aria-labelledby="h-combos">
          <h2 id="h-combos" className="k-chart__title">
            {ui.stats.combos_title}
          </h2>
          <p className="k-cap -mt-1 mb-2">{ui.stats.combos_lead}</p>
          <ol className="k-chart__list">
            {stats.topCombos.map((c) => {
              const pct = stats.verified ? Math.round((c.count / stats.verified) * 100) : 0;
              return (
                <li key={c.options.join("|")} className="flex items-baseline gap-2 border-b border-rule-soft py-1">
                  <span className="k-stat-m w-[72px] shrink-0">
                    {pct}
                    {NB}%
                  </span>
                  <span>{c.options.map(label).join(" · ")}</span>
                </li>
              );
            })}
          </ol>
          <p className="k-chart__foot">{ui.stats.disclaimer}</p>
        </section>
      )}
    </div>
  );
}

/** Počty: ověřené podpisy = klíčové číslo obrazovky (jediný červený prvek), čekající menší. */
export function StatsCounts({ stats }: { stats: StatsResult }) {
  return (
    <dl className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
      <div className="flex flex-col-reverse">
        <dt className="font-medium">{ui.stats.verified_label}</dt>
        <dd className="k-stat-xl text-red">{formatCz(stats.verified)}</dd>
      </div>
      <div className="flex flex-col-reverse">
        <dt className="font-medium text-ink-secondary">{ui.stats.pending_label}</dt>
        <dd className="k-stat-l">{formatCz(stats.pending)}</dd>
      </div>
    </dl>
  );
}
