"use client";

import { useRef, useState } from "react";
import { facts, questionsFile, t, ui } from "@/lib/content";
import type { Question } from "@/lib/content/schemas";
import type { Statement } from "@/lib/compose/core";
import { isAnswered, type Evaluation } from "@/lib/compose/engine";
import { QUESTION_ORDER } from "@/lib/compose/order";
import { formatAmount, q1Anchors } from "@/lib/compose/q1";
import type { AnswerValue, QuestionId } from "@/lib/compose/types";
import { AnswerOption } from "@/components/ui/answer";
import { BudgetSlider } from "@/components/ui/budget-slider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/fields";
import { Notice, ScreenHeading } from "@/components/ui/typography";
import { nextMultiValue } from "./select";

/**
 * Přehled odpovědí (krok „Můj text“): všechny otázky v pořadí zobrazení s vybranou odpovědí.
 * Každou jde změnit na místě (rozbalí se volby / posuvník), větvení platí živě – odpovědi,
 * které změna zrušila, jsou zvýrazněné (SPEC §5.2) – a text nahoře se mění s každou volbou.
 * Načítá se líně (samostatný chunk), aby nezvětšoval JS první obrazovky kompasu.
 */

const units = { unit_decimal: ui.slider.unit_decimal, unit_whole: ui.slider.unit_whole };
const sliderAnchors = q1Anchors(questionsFile, facts).map((a) => ({ value: a.value, label: a.label }));

const questionOf = (qid: QuestionId): Question => questionsFile.questions.find((q) => q.id === qid)!;
const optionLabel = (id: string): string =>
  questionsFile.questions.flatMap((q) => q.options).find((o) => o.id === id)?.label ?? id;

export default function Summary({
  statement,
  evaluation,
  answers,
  invalidated,
  hideUnknown,
  onToggleHide,
  onAnswer,
  onRestart,
  headingRef,
}: {
  statement: Statement;
  evaluation: Evaluation;
  /** Uživatelovy odpovědi (bez předvyplněných). */
  answers: Partial<Record<QuestionId, AnswerValue>>;
  invalidated: QuestionId[];
  hideUnknown: boolean;
  onToggleHide: (v: boolean) => void;
  onAnswer: (qid: QuestionId, v: AnswerValue | undefined) => void;
  onRestart: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [open, setOpen] = useState<QuestionId | null>(null);
  const rowRefs = useRef<Partial<Record<QuestionId, HTMLButtonElement | null>>>({});
  const { states, effective } = evaluation;

  const collapse = (qid: QuestionId) => {
    setOpen(null);
    requestAnimationFrame(() => rowRefs.current[qid]?.focus());
  };

  const answerText = (qid: QuestionId): string => {
    if (states[qid].status === "skipped") return ui.compass.skipped_short;
    const v = effective[qid];
    if (!isAnswered(v)) return ui.compass.not_answered;
    if (typeof v === "number") return formatAmount(v, units);
    return (Array.isArray(v) ? v : [v as string]).map(optionLabel).join(", ");
  };

  return (
    <section aria-labelledby="h-summary">
      <ScreenHeading id="h-summary" headingRef={headingRef} title={ui.compass.summary_title} lead={ui.compass.summary_lead} />
      <div className="k-letter mt-3" aria-live="polite">
        <p>{statement.text}</p>
      </div>
      <div className="mt-1">
        <Checkbox label={ui.preview.hide_nevim} checked={hideUnknown} onChange={onToggleHide} />
      </div>

      <h2 className="k-h k-h2 mb-1 mt-5">{ui.compass.answers_title}</h2>
      <ol className="border-t-2 border-ink">
        {QUESTION_ORDER.map((qid, i) => {
          const q = questionOf(qid);
          const st = states[qid];
          const skipped = st.status === "skipped";
          const invalid = invalidated.includes(qid) && !isAnswered(answers[qid]);
          const isOpen = open === qid;
          const panelId = `sum-${qid}`;
          return (
            <li key={qid} className="k-sumrow" data-invalid={invalid || undefined} data-skipped={skipped || undefined} data-q={qid}>
              <p className="k-cap">{t(ui.compass.question_number, { n: i + 1 })}</p>
              <h3 className="font-semibold">{q.text}</h3>
              <p className="k-sumrow__value mt-0.5 text-[20px] font-bold leading-7">{answerText(qid)}</p>
              {invalid && (
                <Notice className="mt-1">
                  <p className="font-semibold">{ui.compass.invalidated_short}</p>
                </Notice>
              )}
              {skipped && st.skippedBy && <p className="k-cap mt-0.5">{t(ui.compass.skipped_lead, { option: optionLabel(st.skippedBy.option) })}</p>}
              {!skipped && st.forced && st.forcedBy && (
                <p className="k-cap mt-0.5">{t(ui.compass.forced_note, { option: optionLabel(st.forcedBy.option) })}</p>
              )}
              <button
                type="button"
                ref={(el) => {
                  rowRefs.current[qid] = el;
                }}
                className="k-link"
                aria-expanded={isOpen}
                aria-controls={isOpen ? panelId : undefined}
                aria-label={t(ui.compass.change_aria, { question: q.text })}
                onClick={() => (isOpen ? collapse(qid) : setOpen(qid))}
              >
                {ui.compass.change_button}
              </button>
              {isOpen && (
                <div id={panelId} className="mt-1">
                  <AnswerEditor
                    question={q}
                    evaluation={evaluation}
                    userValue={answers[qid]}
                    onAnswer={(v, done) => {
                      onAnswer(qid, v);
                      if (done) collapse(qid);
                    }}
                    onCause={(c) => setOpen(c)}
                  />
                  <Button variant="secondary" className="mt-1" onClick={() => collapse(qid)}>
                    {ui.compass.close_editor_button}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={onRestart} className="k-link mt-2">
        {ui.compass.restart_button}
      </button>
    </section>
  );
}

/** Volby jedné otázky na místě. U jedné volby se po výběru panel zavře (`done`). */
function AnswerEditor({
  question: q,
  evaluation,
  userValue,
  onAnswer,
  onCause,
}: {
  question: Question;
  evaluation: Evaluation;
  userValue: AnswerValue | undefined;
  onAnswer: (v: AnswerValue | undefined, done: boolean) => void;
  /** Klepnutí na nedostupnou volbu otevře otázku, která ji blokuje. */
  onCause: (qid: QuestionId) => void;
}) {
  const qid = q.id as QuestionId;
  const state = evaluation.states[qid];
  const value = evaluation.effective[qid];
  const isSelected = (id: string) => (Array.isArray(value) ? value.includes(id) : value === id);

  return (
    <div role={q.type === "multi" ? "group" : "radiogroup"} aria-label={q.text} className="flex flex-col gap-1">
      {q.type === "slider" && q.slider && state.status !== "skipped" && (
        <div className="mb-2 mt-1">
          <BudgetSlider
            value={typeof userValue === "number" ? userValue : q.slider.default}
            min={q.slider.min}
            max={q.slider.max}
            step={q.slider.step}
            snap={0.15}
            anchors={sliderAnchors}
            idle={typeof userValue !== "number"}
            onChange={(v) => onAnswer(v, false)}
            texts={{
              label: ui.slider.slider_aria,
              unit: ui.slider.unit_short,
              perYear: ui.slider.per_year_long,
              decreaseAria: ui.slider.decrease_aria,
              increaseAria: ui.slider.increase_aria,
              valueText: ui.slider.value_text,
              notchAria: ui.slider.notch_aria,
            }}
          />
        </div>
      )}
      {q.options.map((o) => {
        const cause = state.disabled[o.id];
        return (
          <AnswerOption
            key={o.id}
            label={o.label}
            multiple={q.type === "multi"}
            selected={isSelected(o.id)}
            disabled={Boolean(cause)}
            tag={cause ? t(ui.compass.disabled_label, { option: optionLabel(cause.option) }) : undefined}
            explainLabel={ui.compass.disabled_why}
            onExplain={() => cause && onCause(cause.question)}
            onSelect={() => {
              if (q.type === "multi") return onAnswer(nextMultiValue(q, userValue, o.id), false);
              onAnswer(userValue === o.id ? undefined : o.id, userValue !== o.id);
            }}
          />
        );
      })}
    </div>
  );
}
