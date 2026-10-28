import type { Metadata } from "next";
import { SampleBanner } from "@/components/ui/sample";
import { Notice } from "@/components/ui/typography";
import { questionsFile, t, ui } from "@/lib/content";
import { evaluate } from "@/lib/compose/engine";
import { QUESTION_IDS, type QuestionId } from "@/lib/compose/types";
import { flags } from "@/lib/env";
import { answerLabel, formatDateCz } from "@/lib/org/format";
import type { PublicOrganization } from "@/lib/org/service";
import { getOrganizations } from "@/lib/org/source";
import { pagesTexts, type PagesTexts } from "@/lib/org/texts";
import { Disclosure, Page, PageHead, PrimaryAction } from "../metodika/_ui";

/**
 * /hnuti (SPEC §12, §13): strany a hnutí abecedně, s odpověďmi a odůvodněním, nebo
 * „Neodpověděl/a (pozváno dne …)“. Fiktivní subjekty jen s DEMO_MODE=1 / STATIC_DEMO=1
 * a pruhem „Ukázková data“. ISR jako statistiky (SPEC §14.2); po odeslání revalidatePath.
 */
export const revalidate = 60;

export function generateMetadata(): Metadata {
  return { title: pagesTexts().hnuti.meta_title };
}

type H = PagesTexts["hnuti"];

const typeLabel = (o: PublicOrganization, h: H) =>
  o.type === "strana" ? h.type_strana : o.type === "hnuti" ? h.type_hnuti : h.type_iniciativa;

function Answers({ o, h }: { o: PublicOrganization; h: H }) {
  const answers = o.answers ?? {};
  const { states } = evaluate(answers, questionsFile);
  const units = { unit_decimal: ui.slider.unit_decimal, unit_whole: ui.slider.unit_whole };
  return (
    <ol className="flex flex-col gap-2">
      {QUESTION_IDS.map((qid: QuestionId, i) => {
        const q = questionsFile.questions.find((x) => x.id === qid)!;
        const label = answerLabel(q, answers[qid], units);
        const skipped = states[qid].status === "skipped";
        const why = o.justifications?.[qid];
        return (
          <li key={qid} className="border-t border-rule-soft pt-2">
            <p className="text-caption text-ink-secondary">
              {i + 1}. {q.text}
            </p>
            <p className="font-semibold">{label ?? (skipped ? h.skipped_question : h.not_answered_question)}</p>
            <p className="mt-0.5 text-small">
              <span className="text-ink-secondary">{h.justification_label}: </span>
              {/* Uživatelský obsah jen jako prostý text (SPEC §14.3). */}
              <span className="whitespace-pre-line">{why || h.no_justification}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default async function OrganizationsPage() {
  const h = pagesTexts().hnuti;
  const list = await getOrganizations();
  const demo = flags.showDemoBar() && Boolean(list?.some((o) => o.isSeed));

  return (
    <>
      {demo && (
        <div className="k-wrap pt-2">
          <SampleBanner title={ui.demo.banner_title} text={ui.demo.banner_text} />
        </div>
      )}
      <Page>
        <PageHead title={h.title} lead={h.lead} />

        {list === null ? (
          <Notice role="status" className="mb-4">
            {h.unavailable}
          </Notice>
        ) : list.length === 0 ? (
          <section className="mb-4">
            <h2 className="k-h k-h2">{h.empty_title}</h2>
            <p className="k-lede">{h.empty_lead}</p>
          </section>
        ) : (
          <ul className="mb-4 flex flex-col gap-4">
            {list.map((o) => (
              <li key={o.id} className="border-t-2 border-ink pt-2">
                <h2 className="k-h k-h2">{o.name}</h2>
                <p className="k-cap mt-0.5">
                  {typeLabel(o, h)} ·{" "}
                  {o.submittedAt
                    ? t(h.answered, { date: formatDateCz(o.submittedAt) })
                    : t(h.not_answered, { date: formatDateCz(o.invitedAt) })}
                </p>
                {o.submittedAt && (
                  <div className="mt-1">
                    <Disclosure title={h.answers_open} level={3}>
                      <Answers o={o} h={h} />
                    </Disclosure>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <Disclosure title={h.how_title}>
          <p>{h.how_body}</p>
        </Disclosure>

        <PrimaryAction href="/kompas">{h.compass_button}</PrimaryAction>
      </Page>
    </>
  );
}
