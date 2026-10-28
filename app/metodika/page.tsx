import type { Metadata } from "next";
import { questionsFile, sentencesFile, t } from "@/lib/content";
import { branchingRules, sentenceLibrary, type LibraryGroup } from "@/lib/methodology/library";
import { buildSourcesIndex, humanReviewedItems } from "@/lib/methodology/sources";
import { pagesTexts } from "@/lib/org/texts";
import { Icon } from "@/components/ui/icon";
import { Disclosure, ExternalLink, Page, PageHead, PrimaryAction } from "./_ui";

/** /metodika (SPEC §11.3, §13): jak kompas funguje, větvení, knihovna vět, ověřování, data. Statická. */
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return { title: pagesTexts().method.meta_title };
}

function groupTitle(g: LibraryGroup, m: ReturnType<typeof pagesTexts>["method"]): string {
  if (g.key === "frame") return m.library_group_frame;
  if (g.key === "nevim") return m.library_group_nevim;
  if (g.key === "q1") return m.library_group_q1;
  if (g.key === "multi") return m.library_group_multi;
  const q = questionsFile.questions.find((x) => x.id === g.questionId);
  return q ? `${q.id.toUpperCase()}: ${q.text}` : m.library_group_options;
}

export default function MethodPage() {
  const m = pagesTexts().method;
  const library = sentenceLibrary(sentencesFile, questionsFile);
  const rules = branchingRules(questionsFile);
  const index = buildSourcesIndex();
  const human = humanReviewedItems(index);

  return (
    <Page>
      <PageHead kicker={m.kicker} title={m.title} lead={m.lead} />

      <Disclosure title={m.compose_title}>
        <p>{m.compose_body}</p>
      </Disclosure>

      <Disclosure title={m.branching_title}>
        <p>{m.branching_body}</p>
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <li key={r.id}>
              <p className="font-semibold">{t(m.branching_when, { question: r.question, option: r.option })}:</p>
              <ul className="ml-2 list-[square] pl-2">
                {r.effects.map((e, i) => (
                  <li key={i}>
                    {e.kind === "skip"
                      ? t(m.branching_skip, { question: e.question })
                      : t(e.kind === "only" ? m.branching_only : m.branching_disable, {
                          question: e.question,
                          options: e.options.join("“, „"),
                        })}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Disclosure>

      <Disclosure title={m.library_title} sub={t(m.library_version, { version: sentencesFile.version })}>
        <p>{m.library_body}</p>
        {library.map((g) => (
          <section key={`${g.key}-${g.questionId ?? ""}`} aria-label={groupTitle(g, m)}>
            <h3 className="k-h3 mt-2">{groupTitle(g, m)}</h3>
            <table className="mt-1 w-full border-collapse text-small">
              <thead>
                <tr className="border-b-2 border-ink text-left">
                  <th scope="col" className="py-1 pr-2 font-semibold">{m.library_id}</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">{m.library_ver}</th>
                  <th scope="col" className="py-1 font-semibold">{m.library_text}</th>
                </tr>
              </thead>
              <tbody>
                {g.sentences.map((s) => (
                  <tr key={s.id} className="border-b border-rule-soft align-top">
                    <td className="py-1 pr-2 break-all">{s.id}</td>
                    <td className="k-num py-1 pr-2">{s.version}</td>
                    <td className="py-1">
                      {s.optionLabel && <span className="block text-caption text-ink-secondary">{s.optionLabel}</span>}
                      {s.text ?? t(m.library_fragment, { text: s.fragment ?? "" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </Disclosure>

      <Disclosure
        title={m.verify_title}
        sub={t(m.counts, { total: index.totals.claims, verified: index.totals.verified, open: index.totals.open })}
      >
        <p>{m.verify_body}</p>
        <h3 className="k-h3">{m.deviation_title}</h3>
        <p>{m.deviation_body}</p>
      </Disclosure>

      <Disclosure title={m.human_title} sub={String(human.length)}>
        <p>{human.length ? t(m.human_some, { items: human.join(", ") }) : m.human_none}</p>
      </Disclosure>

      <Disclosure title={m.data_title}>
        <p>{m.data_body}</p>
        <p className="flex flex-col items-start">
          <a href="/api/open-data" className="k-link" download>
            {m.data_button}
            <Icon name="download" size={18} />
          </a>
          <ExternalLink href={m.repo_url}>{m.repo_link}</ExternalLink>
        </p>
      </Disclosure>

      <PrimaryAction href="/metodika/zdroje">{m.sources_button}</PrimaryAction>
    </Page>
  );
}
