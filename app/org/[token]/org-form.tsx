"use client";

import { useMemo, useState } from "react";
import { AnswerOption } from "@/components/ui/answer";
import { BudgetSlider } from "@/components/ui/budget-slider";
import { Button, ButtonLink, StickyBar } from "@/components/ui/button";
import { Checkbox, TextArea } from "@/components/ui/fields";
import { Kicker, Notice, ScreenHeading } from "@/components/ui/typography";
import { facts, questionsFile, t, ui } from "@/lib/content";
import { evaluate } from "@/lib/compose/engine";
import { formatAmount, q1Anchors } from "@/lib/compose/q1";
import { QUESTION_ORDER } from "@/lib/compose/order";
import type { Answers, AnswerValue, QuestionId } from "@/lib/compose/types";
import type { Question } from "@/lib/content/schemas";
import type { OrgFormTexts } from "@/lib/org/texts";
import { Section } from "../../metodika/_section";

/**
 * Formulář subjektu (SPEC §12): stejné otázky a větvení jako kompas, na jedné stránce,
 * ke každé otázce odůvodnění do 300 znaků. Po odeslání se odpovědi uzamknou.
 */

const JUSTIFICATION_MAX = 300;
const anchors = q1Anchors(questionsFile, facts).map((a) => ({ value: a.value, label: a.label }));

const optionLabel = (id: string) =>
  questionsFile.questions.flatMap((q) => q.options).find((o) => o.id === id)?.label ?? id;

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string }
  | { kind: "done" };

export function OrgForm({ token, name, t: tx }: { token: string; name: string; t: OrgFormTexts }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [why, setWhy] = useState<Partial<Record<QuestionId, string>>>({});
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const evaluation = useMemo(() => evaluate(answers, questionsFile), [answers]);
  const units = { unit_decimal: ui.slider.unit_decimal, unit_whole: ui.slider.unit_whole };
  const total = questionsFile.questions.length;

  const set = (qid: QuestionId, value: AnswerValue | undefined) => {
    const next = { ...answers };
    if (value === undefined) delete next[qid];
    else next[qid] = value;
    setAnswers(evaluate(next, questionsFile).cleaned);
    if (status.kind === "error") setStatus({ kind: "idle" });
  };

  const toggleMulti = (q: Question, id: string) => {
    const current = (answers[q.id as QuestionId] as string[] | undefined) ?? [];
    const opt = q.options.find((o) => o.id === id)!;
    let next: string[];
    if (current.includes(id)) next = current.filter((x) => x !== id);
    else if (opt.exclusive) next = [id];
    else next = [...current.filter((x) => !q.options.find((o) => o.id === x)?.exclusive), id];
    set(q.id as QuestionId, next.length ? next : undefined);
  };

  async function submit() {
    if (!confirm) return setStatus({ kind: "error", message: tx.error_confirm });
    if (!Object.keys(evaluation.cleaned).length) return setStatus({ kind: "error", message: tx.error_empty });
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/org/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, answers: evaluation.cleaned, justifications: why, confirm: true }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (res.ok && body.ok) {
        setStatus({ kind: "done" });
        window.scrollTo({ top: 0 });
        return;
      }
      setStatus({ kind: "error", message: body.message || tx.error_unavailable });
    } catch {
      setStatus({ kind: "error", message: tx.error_unavailable });
    }
  }

  if (status.kind === "done") {
    return (
      <section role="status" aria-live="polite">
        <ScreenHeading title={tx.done_title} lead={tx.done_lead} />
        <StickyBar className="mt-4">
          <ButtonLink href="/hnuti" block iconEnd="arrow-right">
            {tx.done_button}
          </ButtonLink>
        </StickyBar>
      </section>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ScreenHeading kicker={tx.kicker} title={t(tx.title, { name })} lead={tx.lead} className="mb-3" />

      <div className="mb-4">
        <Section title={tx.lock_title}>
          <p>{tx.lock_body}</p>
        </Section>
      </div>

      <ol className="flex flex-col gap-6">
        {QUESTION_ORDER.map((qid, i) => {
          const q = questionsFile.questions.find((x) => x.id === qid)!;
          const st = evaluation.states[qid];
          const value = evaluation.effective[qid];
          const legendId = `${qid}-legend`;
          const whyId = `${qid}-why`;
          const text = why[qid] ?? "";
          if (st.status === "skipped") {
            return (
              <li key={qid} className="hatch border-2 border-muted p-2 text-muted">
                <Kicker>{t(tx.question_label, { n: i + 1, total })}</Kicker>
                <h2 className="k-h k-h2 mt-1">{q.text}</h2>
                <p className="mt-1 font-semibold">{t(tx.skipped_lead, { option: optionLabel(st.skippedBy!.option) })}</p>
              </li>
            );
          }
          return (
            <li key={qid}>
              <fieldset className="k-group" aria-labelledby={legendId} role={q.type === "multi" ? "group" : "radiogroup"}>
                <legend className="k-group__legend" id={legendId}>
                  <Kicker as="span">{t(tx.question_label, { n: i + 1, total })}</Kicker>
                  <span className="k-h k-h2 mt-1 block">{q.text}</span>
                  {q.type === "multi" && <span className="k-lede block">{tx.multi_lead}</span>}
                  {st.forced && st.forcedBy && (
                    <span className="k-cap mt-1 block">{t(tx.forced_note, { option: optionLabel(st.forcedBy.option) })}</span>
                  )}
                </legend>

                {q.type === "slider" && q.slider && (
                  <div className="mb-1 flex flex-col items-start">
                    <div className="w-full">
                      <BudgetSlider
                        value={typeof value === "number" ? value : q.slider.default}
                        min={q.slider.min}
                        max={q.slider.max}
                        step={q.slider.step}
                        anchors={anchors}
                        idle={typeof value !== "number"}
                        onChange={(v) => set(qid, v)}
                        live={typeof value === "number" ? t(tx.slider_value, { amount: formatAmount(value, units) }) : tx.slider_untouched}
                        texts={{
                          label: tx.slider_label,
                          unit: ui.slider.unit_short,
                          perYear: ui.slider.per_year_long,
                          decreaseAria: ui.slider.decrease_aria,
                          increaseAria: ui.slider.increase_aria,
                          valueText: ui.slider.value_text,
                          notchAria: ui.slider.notch_aria,
                        }}
                      />
                    </div>
                    {typeof value === "number" && (
                      <Button variant="secondary" onClick={() => set(qid, undefined)}>
                        {tx.slider_clear_button}
                      </Button>
                    )}
                  </div>
                )}

                {q.options.map((o) => {
                  const cause = st.disabled[o.id];
                  const checked = Array.isArray(value) ? value.includes(o.id) : value === o.id;
                  return (
                    <AnswerOption
                      key={o.id}
                      label={o.label}
                      selected={checked}
                      multiple={q.type === "multi"}
                      disabled={Boolean(cause)}
                      tag={cause ? t(tx.disabled_label, { option: optionLabel(cause.option) }) : undefined}
                      onSelect={() => {
                        if (q.type === "multi") toggleMulti(q, o.id);
                        else set(qid, checked && !st.forced ? undefined : o.id);
                      }}
                    />
                  );
                })}
              </fieldset>

              <TextArea
                className="mt-2"
                id={whyId}
                label={tx.justification_label}
                hint={tx.justification_hint}
                maxLength={JUSTIFICATION_MAX}
                value={text}
                onChange={(e) => setWhy((w) => ({ ...w, [qid]: e.target.value.slice(0, JUSTIFICATION_MAX) }))}
                counter={<span aria-live="polite">{t(tx.chars_left, { n: JUSTIFICATION_MAX - [...text].length })}</span>}
              />
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        <Checkbox label={tx.confirm_label} checked={confirm} onChange={setConfirm} />
      </div>

      {status.kind === "error" && (
        <Notice role="alert" className="mt-2">
          {status.message}
        </Notice>
      )}

      <StickyBar className="mt-4">
        <Button type="submit" block iconEnd="arrow-right" aria-busy={status.kind === "sending"} disabled={status.kind === "sending"}>
          {status.kind === "sending" ? tx.sending : tx.submit_button}
        </Button>
      </StickyBar>
    </form>
  );
}
