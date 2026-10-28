import { questionsFile, t, ui } from "@/lib/content";
import { QUESTION_IDS, type QuestionId } from "@/lib/compose/types";
import { chartOrder, type StatsResult } from "@/lib/stats/aggregate";
import { BarChart } from "@/components/bar-chart";

const label = (id: string) => {
  for (const q of questionsFile.questions) {
    const o = q.options.find((x) => x.id === id);
    if (o) return o.label;
  }
  return id;
};

export function QuestionChart({ stats, qid }: { stats: StatsResult; qid: QuestionId }) {
  const q = questionsFile.questions.find((x) => x.id === qid)!;
  const qs = stats.questions[qid];
  return (
    <BarChart
      title={q.text}
      total={qs.total}
      totalLabel={t(ui.stats.respondents, { n: qs.total })}
      disclaimer={ui.stats.disclaimer}
      data={chartOrder(questionsFile, qid).map(({ key, label }) => ({ key, label, count: qs.counts[key] ?? 0 }))}
    />
  );
}

export function StatsCharts({ stats }: { stats: StatsResult }) {
  if (stats.verified === 0) return <p className="mt-6 text-muted">{ui.stats.no_data}</p>;
  return (
    <div className="mt-8 space-y-10">
      {QUESTION_IDS.map((qid) => (
        <QuestionChart key={qid} stats={stats} qid={qid} />
      ))}
      {stats.topCombos.length > 0 && (
        <section className="border-t-2 border-ink pt-4" aria-labelledby="h-combos">
          <h2 id="h-combos" className="text-xl font-bold">
            {ui.stats.combos_title}
          </h2>
          <p className="text-muted">{ui.stats.combos_lead}</p>
          <ol className="mt-4 space-y-3">
            {stats.topCombos.map((c) => {
              const pct = stats.verified ? Math.round((c.count / stats.verified) * 100) : 0;
              return (
                <li key={c.options.join("|")} className="border-l-4 border-blue pl-3">
                  <p className="tabular font-semibold">{pct} %</p>
                  <p>{c.options.map(label).join(" · ")}</p>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-sm text-muted">{ui.stats.disclaimer}</p>
        </section>
      )}
    </div>
  );
}

export function StatsCounts({ stats }: { stats: StatsResult }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-4 border-y-2 border-ink py-4">
      <div className="flex flex-col-reverse">
        <dt className="text-muted">{ui.stats.verified_label}</dt>
        <dd className="tabular text-4xl font-bold">{stats.verified.toLocaleString("cs-CZ")}</dd>
      </div>
      <div className="flex flex-col-reverse">
        <dt className="text-muted">{ui.stats.pending_label}</dt>
        <dd className="tabular text-4xl font-bold">{stats.pending.toLocaleString("cs-CZ")}</dd>
      </div>
    </dl>
  );
}
