"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { facts, questionsFile, t, ui } from "@/lib/content";
import type { Question } from "@/lib/content/schemas";
import { composeStatement, currentContentVersion, evaluate, isAnswered } from "@/lib/compose";
import type { Cause, QuestionState } from "@/lib/compose/engine";
import { formatAmount, formatInt, perAdultMonthly, q1Anchors } from "@/lib/compose/q1";
import { QUESTION_IDS, type Answers, type AnswerValue, type Demographics, type QuestionId } from "@/lib/compose/types";
import { emptyState, loadCompassState, saveCompassState, clearCompassState, type CompassState } from "@/lib/compass-storage";
import { ExplainerBody } from "@/components/explainer";
import { ActionButton, ActionList } from "@/components/ui/action-list";
import { AnswerGroup, AnswerOption } from "@/components/ui/answer";
import { BudgetSlider } from "@/components/ui/budget-slider";
import { Button, ButtonLink, StickyBar } from "@/components/ui/button";
import { BottomSheet, Disclosure } from "@/components/ui/disclosure";
import { ProgressBar, type ProgressState } from "@/components/ui/progress";
import { Notice, ScreenHeading } from "@/components/ui/typography";
import { Demographics as DemographicsStep } from "./demographics";
import { StatementAside, StatementPreview } from "./statement-preview";

const STEP_IDS = [...QUESTION_IDS, "o-vas", "text"] as const;
type StepId = (typeof STEP_IDS)[number];
const DEMO_STEP = 8;
const SUMMARY_STEP = 9;

const anchors = q1Anchors(questionsFile, facts);
const sliderAnchors = anchors.map((a) => ({ value: a.value, label: a.label }));
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
  const setHide = (v: boolean) => setState((s) => ({ ...s, hideUnknown: v }));

  const segments: ProgressState[] = QUESTION_IDS.map((qid, i) =>
    isSkipped(i) ? "skipped" : i === step ? "current" : isAnswered(evaluation.effective[qid]) ? "done" : "todo",
  );

  const stepId = STEP_IDS[step]!;
  const progressLabel = t(ui.compass.progress_label, { n: Math.min(step + 1, 8), total: 8 });

  return (
    <div className="k-wrap pb-3 pt-3 lg:grid lg:grid-cols-[minmax(0,688px)_448px] lg:justify-between lg:gap-6 lg:pt-5">
      <div className="min-w-0">
        <ProgressBar segments={segments} current={step < 8 ? step + 1 : 0} labelText={progressLabel} ariaLabel={progressLabel} />

        <div className="mt-4">
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
        </div>

        {step < SUMMARY_STEP && (
          <div className="mt-4 lg:hidden">
            <StatementPreview statement={statement} hideUnknown={state.hideUnknown} onToggleHide={setHide} />
          </div>
        )}

        <div className="mt-2 md:mt-4">
          <StickyBar>
            {step < DEMO_STEP && (
              <Button block iconEnd="arrow-right" onClick={next}>
                {ui.compass.next_button}
              </Button>
            )}
            {step === DEMO_STEP && (
              <Button block iconEnd="arrow-right" onClick={next}>
                {ui.compass.finish_button}
              </Button>
            )}
            {step === SUMMARY_STEP && (
              <ButtonLink href="/kompas/podpis" block iconEnd="arrow-right">
                {ui.compass.sign_button}
              </ButtonLink>
            )}
            {step > 0 && (
              <Button variant="secondary" icon="chevron-left" onClick={back}>
                {ui.compass.back_button}
              </Button>
            )}
          </StickyBar>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-3 border-l-2 border-ink pl-4">
          <StatementAside statement={statement} hideUnknown={state.hideUnknown} onToggleHide={setHide} />
        </div>
      </aside>
    </div>
  );
}

type OpenExplainer = { id: string; title: string; inline: boolean } | null;

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
  const [expl, setExpl] = useState<OpenExplainer>(null);
  const qid = q.id as QuestionId;
  const skipped = state.status === "skipped";
  const causeQuestion = (c: Cause) => questionOf(c.question).text;

  const toggleExplainer = (id: string, title: string) => {
    if (expl?.id === id) return setExpl(null);
    const inline = window.matchMedia("(min-width: 768px)").matches;
    setExpl({ id, title, inline });
  };
  const inlineOpen = (id: string) => expl?.id === id && expl.inline;

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
      <AnswerGroup
        legend={q.text}
        headingId={`h-${qid}`}
        headingRef={headingRef}
        multiple={q.type === "multi"}
        lede={skipped ? undefined : q.type === "multi" ? ui.compass.multi_lead : q.type === "slider" ? ui.slider.lead : ui.compass.single_lead}
      >
        {invalidated && !isAnswered(userValue) && (
          <Notice role="alert">
            <p className="font-semibold">{ui.compass.invalidated_note}</p>
          </Notice>
        )}
        {skipped && state.skippedBy && (
          <Notice tone="info">
            <p className="font-semibold">{ui.compass.skipped_title}</p>
            <p>{t(ui.compass.skipped_lead, { option: optionLabel(state.skippedBy.option) })}</p>
            <Button variant="secondary" className="-ml-1" onClick={() => onGoToCause(state.skippedBy!)}>
              {ui.compass.disabled_go_button}
            </Button>
          </Notice>
        )}
        {state.forced && state.forcedBy && (
          <Notice tone="info">
            <p>{t(ui.compass.forced_note, { option: optionLabel(state.forcedBy.option) })}</p>
          </Notice>
        )}

        {q.type === "slider" && q.slider && (
          <div className="mb-2 mt-1">
            <BudgetSlider
              value={sliderValue}
              min={q.slider.min}
              max={q.slider.max}
              step={q.slider.step}
              snap={0.15}
              anchors={sliderAnchors}
              idle={typeof userValue !== "number"}
              onChange={(v) => onAnswer(v)}
              live={perAdult !== null ? t(ui.slider.per_adult, { amount: formatInt(perAdult) }) : null}
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
            {!isAnswered(userValue) && <p className="k-cap mt-1">{ui.slider.untouched}</p>}
            <span className="k-sr" aria-live="polite">
              {typeof userValue === "number" ? formatAmount(userValue, units) : ""}
            </span>
          </div>
        )}

        {q.options.map((o) => {
          const cause = state.disabled[o.id];
          const explId = `dis-${o.id}`;
          const panelId = `ex-${o.id}`;
          const withExplainer = !o.nevim && !cause;
          return (
            <div key={o.id}>
              <div className={withExplainer ? "k-optwrap" : undefined}>
                <AnswerOption
                  label={o.label}
                  multiple={q.type === "multi"}
                  selected={isSelected(o.id)}
                  disabled={Boolean(cause)}
                  tag={cause ? t(ui.compass.disabled_label, { option: optionLabel(cause.option) }) : undefined}
                  explainLabel={ui.compass.disabled_why}
                  onSelect={() => select(o.id)}
                  onExplain={() => setOpenDisabled((x) => (x === o.id ? null : o.id))}
                  expanded={cause ? openDisabled === o.id : undefined}
                  describedBy={cause && openDisabled === o.id ? explId : undefined}
                />
                {withExplainer && (
                  <button
                    type="button"
                    className="k-optq"
                    aria-label={`${ui.explainer.open} ${o.label}`}
                    aria-expanded={inlineOpen(o.id)}
                    aria-controls={inlineOpen(o.id) ? panelId : undefined}
                    onClick={() => toggleExplainer(o.id, o.label)}
                  >
                    <span aria-hidden="true">?</span>
                  </button>
                )}
              </div>
              {cause && openDisabled === o.id && (
                <div id={explId} className="k-disc__panel">
                  <p>{t(ui.compass.disabled_explain, { option: optionLabel(cause.option), question: causeQuestion(cause) })}</p>
                  <Button variant="secondary" className="-ml-1" onClick={() => onGoToCause(cause)}>
                    {ui.compass.disabled_go_button}
                  </Button>
                </div>
              )}
              {inlineOpen(o.id) && (
                <div id={panelId} className="k-disc__panel">
                  <ExplainerBody id={o.id} texts={ui.explainer} />
                </div>
              )}
            </div>
          );
        })}
      </AnswerGroup>

      <div className="mt-2">
        <Disclosure
          label={ui.explainer.open}
          mode={expl?.id === qid && !expl.inline ? "sheet" : "inline"}
          open={inlineOpen(qid)}
          onToggle={() => toggleExplainer(qid, q.text)}
        >
          <ExplainerBody id={qid} texts={ui.explainer} />
        </Disclosure>
      </div>

      <BottomSheet open={Boolean(expl && !expl.inline)} title={expl?.title ?? ""} onClose={() => setExpl(null)} closeLabel={ui.explainer.close}>
        {expl && !expl.inline && <ExplainerBody id={expl.id} texts={ui.explainer} />}
      </BottomSheet>
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
      <ScreenHeading id="h-summary" headingRef={headingRef} title={ui.compass.summary_title} lead={ui.compass.summary_lead} />
      <div className="k-letter mt-3">
        <p>{statementText}</p>
      </div>

      <h2 className="k-h k-h2 mb-2 mt-5">{ui.compass.answers_title}</h2>
      <ActionList>
        {QUESTION_IDS.map((qid, i) => (
          <ActionButton key={qid} onClick={() => onEdit(i)}>
            <span className="k-cap block">{questionOf(qid).text}</span>
            <span className="block">{answerText(qid)}</span>
            <span className="k-sr"> – {ui.compass.edit_answers_button}</span>
          </ActionButton>
        ))}
      </ActionList>
      <button type="button" onClick={onRestart} className="k-link mt-2">
        {ui.compass.restart_button}
      </button>
    </section>
  );
}
