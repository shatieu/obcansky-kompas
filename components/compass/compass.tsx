"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { facts, questionsFile, t, ui } from "@/lib/content";
import type { Question } from "@/lib/content/schemas";
import { composeStatement, currentContentVersion, evaluate, isAnswered } from "@/lib/compose";
import type { Cause, QuestionState } from "@/lib/compose/engine";
import { formatAmount, formatInt, perAdultMonthly, q1Anchors } from "@/lib/compose/q1";
import { QUESTION_IDS, type Answers, type AnswerValue, type Demographics, type QuestionId } from "@/lib/compose/types";
import { emptyState, loadCompassState, saveCompassState, clearCompassState, type CompassState } from "@/lib/compass-storage";
import { AmountSlider } from "@/components/amount-slider";
import { Choice } from "@/components/choice";
import { Explainer } from "@/components/explainer";
import { Progress, type ProgressSegment } from "@/components/progress";
import { StickyAction, buttonLink, buttonPrimary, buttonSecondary } from "@/components/sticky-action";
import { Demographics as DemographicsStep } from "./demographics";
import { StatementPreview } from "./statement-preview";

const STEP_IDS = [...QUESTION_IDS, "o-vas", "text"] as const;
type StepId = (typeof STEP_IDS)[number];
const DEMO_STEP = 8;
const SUMMARY_STEP = 9;

const anchors = q1Anchors(questionsFile, facts);
const units = { unit_decimal: ui.slider.unit_decimal, unit_whole: ui.slider.unit_whole };

function optionLabel(id: string): string {
  for (const q of questionsFile.questions) {
    const o = q.options.find((x) => x.id === id);
    if (o) return o.label;
  }
  return id;
}
function questionOf(qid: QuestionId): Question {
  return questionsFile.questions.find((q) => q.id === qid)!;
}

export function Compass() {
  const [state, setState] = useState<CompassState>(emptyState);
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Načtení z localStorage a z #hash až po hydrataci (server nezná stav prohlížeče).
  useEffect(() => {
    const loaded = loadCompassState();
    const fromHash = STEP_IDS.indexOf(window.location.hash.slice(1) as StepId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jednorázové načtení stavu prohlížeče
    setState(loaded);
    if (fromHash >= 0) setStep(fromHash);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveCompassState(state);
  }, [state, hydrated]);

  useEffect(() => {
    const onHash = () => {
      const i = STEP_IDS.indexOf(window.location.hash.slice(1) as StepId);
      if (i >= 0) setStep(i);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const evaluation = useMemo(() => evaluate(state.answers, questionsFile), [state.answers]);
  const statement = useMemo(
    () => composeStatement(state.answers, currentContentVersion(), { hideUnknown: state.hideUnknown }),
    [state.answers, state.hideUnknown],
  );

  const goTo = useCallback((i: number) => {
    setStep(i);
    const id = STEP_IDS[i]!;
    try {
      window.history.pushState(null, "", `#${id}`);
    } catch {
      /* nic */
    }
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  const isSkipped = (i: number) => i < 8 && evaluation.states[QUESTION_IDS[i]!].status === "skipped";
  const next = () => {
    let i = step + 1;
    while (i < SUMMARY_STEP && isSkipped(i)) i++;
    goTo(Math.min(i, SUMMARY_STEP));
  };
  const back = () => {
    let i = step - 1;
    while (i > 0 && isSkipped(i)) i--;
    goTo(Math.max(i, 0));
  };

  const setAnswer = (qid: QuestionId, value: AnswerValue | undefined) => {
    setState((s) => {
      const answers: Answers = { ...s.answers };
      if (value === undefined || (Array.isArray(value) && value.length === 0)) delete answers[qid];
      else answers[qid] = value;
      const ev = evaluate(answers, questionsFile);
      const invalidated = new Set(s.invalidated.filter((q) => q !== qid));
      for (const q of ev.invalidated) invalidated.add(q);
      return { ...s, answers: ev.cleaned, invalidated: QUESTION_IDS.filter((q) => invalidated.has(q)) };
    });
  };

  const setDemographics = (d: Demographics) => setState((s) => ({ ...s, demographics: d }));

  const segments: ProgressSegment[] = QUESTION_IDS.map((qid, i) => ({
    id: qid,
    state: isSkipped(i) ? "skipped" : isAnswered(evaluation.effective[qid]) ? "done" : "todo",
  }));

  const stepId = STEP_IDS[step]!;
  const progressLabel = t(ui.compass.progress_label, { n: Math.min(step + 1, 8), total: 8 });

  return (
    <div className="mx-auto max-w-5xl px-4 pb-6 pt-4 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:gap-10 md:pt-8">
      <div className="min-w-0">
        <div className="mb-6">
          <Progress segments={segments} current={step < 8 ? step : -1} label={progressLabel} />
          {step < 8 && <p className="tabular mt-3 text-sm text-muted">{progressLabel}</p>}
        </div>

        <div className="md:hidden">
          <StatementPreview statement={statement} hideUnknown={state.hideUnknown} collapsible onToggleHide={(v) => setState((s) => ({ ...s, hideUnknown: v }))} />
        </div>

        {step < 8 && (
          <QuestionStep
            key={stepId}
            question={questionOf(stepId as QuestionId)}
            state={evaluation.states[stepId as QuestionId]}
            value={evaluation.effective[stepId as QuestionId]}
            userValue={state.answers[stepId as QuestionId]}
            invalidated={state.invalidated.includes(stepId as QuestionId)}
            onAnswer={(v) => setAnswer(stepId as QuestionId, v)}
            onGoToCause={(c) => goTo(QUESTION_IDS.indexOf(c.question))}
            headingRef={headingRef}
          />
        )}
        {step === DEMO_STEP && <DemographicsStep value={state.demographics} onChange={setDemographics} headingRef={headingRef} />}
        {step === SUMMARY_STEP && (
          <Summary
            statementText={statement.text}
            effective={evaluation.effective}
            states={evaluation.states}
            onEdit={(i) => goTo(i)}
            onRestart={() => {
              clearCompassState();
              setState(emptyState());
              goTo(0);
            }}
            headingRef={headingRef}
          />
        )}

        <div className="mt-8">
          <StickyAction>
            {step > 0 && (
              <button type="button" onClick={back} className={buttonSecondary} aria-label={ui.compass.back_button}>
                <ArrowLeft aria-hidden className="size-5" />
                <span className="hidden sm:inline">{ui.compass.back_button}</span>
              </button>
            )}
            {step < DEMO_STEP && (
              <button type="button" onClick={next} className={buttonPrimary}>
                {ui.compass.next_button}
              </button>
            )}
            {step === DEMO_STEP && (
              <button type="button" onClick={next} className={buttonPrimary}>
                {ui.compass.finish_button}
              </button>
            )}
            {step === SUMMARY_STEP && (
              <a href="/kompas/podpis" className={`${buttonPrimary} no-underline`}>
                {ui.compass.sign_button}
              </a>
            )}
          </StickyAction>
        </div>
      </div>

      <aside className="hidden md:block">
        <div className="sticky top-6">
          <StatementPreview statement={statement} hideUnknown={state.hideUnknown} onToggleHide={(v) => setState((s) => ({ ...s, hideUnknown: v }))} />
        </div>
      </aside>
    </div>
  );
}

function QuestionStep({
  question: q,
  state,
  value,
  userValue,
  invalidated,
  onAnswer,
  onGoToCause,
  headingRef,
}: {
  question: Question;
  state: QuestionState;
  value: AnswerValue | undefined;
  userValue: AnswerValue | undefined;
  invalidated: boolean;
  onAnswer: (v: AnswerValue | undefined) => void;
  onGoToCause: (c: Cause) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [openDisabled, setOpenDisabled] = useState<string | null>(null);
  const qid = q.id as QuestionId;
  const skipped = state.status === "skipped";
  const causeQuestion = (c: Cause) => questionOf(c.question).text;

  const select = (optionId: string) => {
    const opt = q.options.find((o) => o.id === optionId)!;
    if (q.type === "multi") {
      const cur = Array.isArray(userValue) ? userValue : [];
      if (opt.exclusive) return onAnswer(cur.includes(optionId) ? undefined : [optionId]);
      const withoutExclusive = cur.filter((o) => !q.options.find((x) => x.id === o)?.exclusive);
      return onAnswer(
        withoutExclusive.includes(optionId) ? withoutExclusive.filter((o) => o !== optionId) : [...withoutExclusive, optionId],
      );
    }
    onAnswer(userValue === optionId ? undefined : optionId);
  };

  const isSelected = (id: string) => (Array.isArray(value) ? value.includes(id) : value === id);
  const sliderValue = typeof userValue === "number" ? userValue : q.slider?.default ?? 0;
  const perAdult = typeof userValue === "number" ? perAdultMonthly(userValue, facts) : null;

  return (
    <section aria-labelledby={`h-${qid}`}>
      <h1 id={`h-${qid}`} ref={headingRef} tabIndex={-1} className="text-[2rem] font-bold leading-tight outline-none md:text-[2.5rem]">
        {q.text}
      </h1>
      {q.type === "multi" && !skipped && <p className="mt-2 text-muted">{ui.compass.multi_lead}</p>}
      <div className="mt-2">
        <Explainer id={qid} texts={ui.explainer} label={q.text} />
      </div>

      {invalidated && !isAnswered(userValue) && (
        <p role="alert" className="mt-4 flex items-start gap-2 border-l-4 border-ink py-1 pl-3 font-semibold">
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0" />
          {ui.compass.invalidated_note}
        </p>
      )}
      {skipped && state.skippedBy && (
        <div className="mt-4 border-l-4 border-muted py-1 pl-3">
          <p className="font-semibold">{ui.compass.skipped_title}</p>
          <p className="text-muted">{t(ui.compass.skipped_lead, { option: optionLabel(state.skippedBy.option) })}</p>
          <button type="button" className={buttonLink} onClick={() => onGoToCause(state.skippedBy!)}>
            {ui.compass.disabled_go_button}
          </button>
        </div>
      )}
      {state.forced && state.forcedBy && (
        <p className="mt-4 border-l-4 border-blue py-1 pl-3 text-muted">
          {t(ui.compass.forced_note, { option: optionLabel(state.forcedBy.option) })}
        </p>
      )}

      {q.type === "slider" && q.slider && (
        <div className="mt-6">
          <AmountSlider
            value={sliderValue}
            min={q.slider.min}
            max={q.slider.max}
            step={q.slider.step}
            anchors={anchors}
            active={typeof userValue === "number"}
            onChange={(v) => onAnswer(v)}
            perAdult={perAdult !== null ? t(ui.slider.per_adult, { amount: formatInt(perAdult) }) : null}
            texts={{
              unit: Number.isInteger(sliderValue) ? ui.slider.unit_whole : ui.slider.unit_decimal,
              perYear: ui.slider.per_year,
              sliderAria: ui.slider.slider_aria,
              decreaseAria: ui.slider.decrease_aria,
              increaseAria: ui.slider.increase_aria,
            }}
          />
          {!isAnswered(userValue) && <p className="mt-2 text-sm text-muted">{ui.slider.untouched}</p>}
          <span className="sr-only" aria-live="polite">
            {typeof userValue === "number" ? formatAmount(userValue, units) : ""}
          </span>
        </div>
      )}

      <div role={q.type === "multi" ? "group" : "radiogroup"} aria-labelledby={`h-${qid}`} className="mt-6 space-y-4">
        {q.options.map((o) => {
          const cause = state.disabled[o.id];
          const explId = `dis-${o.id}`;
          return (
            <div key={o.id}>
              <Choice
                label={o.label}
                multi={q.type === "multi"}
                selected={isSelected(o.id)}
                disabledLabel={cause ? t(ui.compass.disabled_label, { option: optionLabel(cause.option) }) : undefined}
                onSelect={() => select(o.id)}
                onDisabledClick={() => setOpenDisabled((x) => (x === o.id ? null : o.id))}
                disabledOpen={openDisabled === o.id}
                describedBy={cause && openDisabled === o.id ? explId : undefined}
              />
              {cause && openDisabled === o.id && (
                <div id={explId} className="border-x-2 border-b-2 border-muted bg-blue-tint p-3">
                  <p>{t(ui.compass.disabled_explain, { option: optionLabel(cause.option), question: causeQuestion(cause) })}</p>
                  <button type="button" className={buttonLink} onClick={() => onGoToCause(cause)}>
                    {ui.compass.disabled_go_button}
                  </button>
                </div>
              )}
              {!o.nevim && <Explainer id={o.id} texts={ui.explainer} label={o.label} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Summary({
  statementText,
  effective,
  states,
  onEdit,
  onRestart,
  headingRef,
}: {
  statementText: string;
  effective: Answers;
  states: Record<QuestionId, QuestionState>;
  onEdit: (step: number) => void;
  onRestart: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const answerText = (qid: QuestionId): string => {
    if (states[qid].status === "skipped") return ui.compass.skipped_short;
    const v = effective[qid];
    if (!isAnswered(v)) return ui.compass.not_answered;
    if (typeof v === "number") return formatAmount(v, units);
    return (Array.isArray(v) ? v : [v as string]).map(optionLabel).join(", ");
  };
  return (
    <section aria-labelledby="h-summary">
      <h1 id="h-summary" ref={headingRef} tabIndex={-1} className="text-[2rem] font-bold leading-tight outline-none md:text-[2.5rem]">
        {ui.compass.summary_title}
      </h1>
      <p className="mt-2 text-muted">{ui.compass.summary_lead}</p>
      <blockquote className="mt-6 border-l-4 border-blue bg-blue-tint p-4 text-lg">{statementText}</blockquote>

      <h2 className="mt-8 text-xl font-bold">{ui.compass.answers_title}</h2>
      <dl className="mt-3 divide-y-2 divide-blue-tint border-y-2 border-ink">
        {QUESTION_IDS.map((qid, i) => (
          <div key={qid} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <dt className="text-sm text-muted">{questionOf(qid).text}</dt>
              <dd className="font-semibold">{answerText(qid)}</dd>
            </div>
            <button type="button" onClick={() => onEdit(i)} className={`${buttonLink} shrink-0`}>
              {ui.compass.edit_answers_button}
            </button>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onRestart} className={`${buttonLink} mt-4`}>
        {ui.compass.restart_button}
      </button>
    </section>
  );
}
