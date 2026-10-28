"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { facts, questionsFile, t, ui } from "@/lib/content";
import type { Question } from "@/lib/content/schemas";
import { composeWith } from "@/lib/compose/core";
import { currentBundle } from "@/lib/compose/current";
import { evaluate, isAnswered, type Cause, type QuestionState } from "@/lib/compose/engine";
import { QUESTION_ORDER } from "@/lib/compose/order";
import { formatAmount, formatInt, perAdultMonthly, q1Anchors } from "@/lib/compose/q1";
import { QUESTION_IDS, type AnswerValue, type Demographics, type QuestionId } from "@/lib/compose/types";
import { applyAnswer, emptyState, loadCompassState, saveCompassState, clearCompassState, type CompassState } from "@/lib/compass-storage";
import { ExplainerBody } from "@/components/explainer";
import { AnswerGroup, AnswerOption } from "@/components/ui/answer";
import { BudgetSlider } from "@/components/ui/budget-slider";
import { Button, ButtonLink, StickyBar } from "@/components/ui/button";
import { BottomSheet, Disclosure } from "@/components/ui/disclosure";
import { Notice } from "@/components/ui/typography";
import { Demographics as DemographicsStep } from "./demographics";
import { QuestionNav, type NavItem } from "./question-nav";
import { nextMultiValue } from "./select";
import { StatementAside, StatementPreview } from "./statement-preview";

/** Přehled odpovědí se načte až při prvním zobrazení (JS první obrazovky ≤ 150 kB). */
const Summary = lazy(() => import("./summary"));

/** Kroky v pořadí zobrazení (questions.yaml `order`); #hash je id otázky, ne pořadí. */
const STEP_IDS = [...QUESTION_ORDER, "o-vas", "text"] as const;
type StepId = (typeof STEP_IDS)[number];
const QCOUNT = QUESTION_ORDER.length;
const DEMO_STEP = QCOUNT;
const SUMMARY_STEP = QCOUNT + 1;

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
    () => composeWith(currentBundle, state.answers, { hideUnknown: state.hideUnknown }),
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

  const isSkipped = (i: number) => i < QCOUNT && evaluation.states[QUESTION_ORDER[i]!].status === "skipped";
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

  const setAnswer = (qid: QuestionId, value: AnswerValue | undefined) => setState((s) => applyAnswer(s, qid, value));

  const setDemographics = (d: Demographics) => setState((s) => ({ ...s, demographics: d }));
  const setHide = (v: boolean) => setState((s) => ({ ...s, hideUnknown: v }));

  const navItems: NavItem[] = QUESTION_ORDER.map((qid, i) => ({
    label: questionOf(qid).short,
    state: i === step ? "current" : isSkipped(i) ? "skipped" : isAnswered(evaluation.effective[qid]) ? "done" : "todo",
  }));
  const hasAnswers = QUESTION_IDS.some((q) => isAnswered(state.answers[q]));
  const restart = () => {
    clearCompassState();
    setState(emptyState());
    goTo(0);
  };

  const stepId = STEP_IDS[step]!;

  return (
    <div className="k-wrap pb-3 pt-3 lg:grid lg:grid-cols-[minmax(0,688px)_448px] lg:justify-between lg:gap-6 lg:pt-5">
      <div className="min-w-0">
        <QuestionNav
          items={navItems}
          current={step < QCOUNT ? step : -1}
          onSelect={goTo}
          summary={{ available: hasAnswers, current: step === SUMMARY_STEP, onSelect: () => goTo(SUMMARY_STEP) }}
        />

        <div className="mt-3">
          {step < QCOUNT && (
            <QuestionStep
              key={stepId}
              question={questionOf(stepId as QuestionId)}
              state={evaluation.states[stepId as QuestionId]}
              value={evaluation.effective[stepId as QuestionId]}
              userValue={state.answers[stepId as QuestionId]}
              invalidated={state.invalidated.includes(stepId as QuestionId)}
              onAnswer={(v) => setAnswer(stepId as QuestionId, v)}
              onGoToCause={(c) => goTo(QUESTION_ORDER.indexOf(c.question))}
              headingRef={headingRef}
            />
          )}
          {step === DEMO_STEP && <DemographicsStep value={state.demographics} onChange={setDemographics} headingRef={headingRef} />}
          {step === SUMMARY_STEP && (
            <Suspense fallback={<p className="text-ink-secondary">{ui.compass.summary_loading}</p>}>
              <Summary
                statement={statement}
                evaluation={evaluation}
                answers={state.answers}
                invalidated={state.invalidated}
                hideUnknown={state.hideUnknown}
                onToggleHide={setHide}
                onAnswer={setAnswer}
                onRestart={restart}
                headingRef={headingRef}
              />
            </Suspense>
          )}
        </div>

        {step < SUMMARY_STEP && (
          <div className="mt-4 lg:hidden">
            <StatementPreview statement={statement} hideUnknown={state.hideUnknown} onToggleHide={setHide} />
          </div>
        )}

        {/* Bez obalového divu: sticky prvek se drží jen v rámci rodiče, obal by ho ukotvil v toku. */}
        <StickyBar className="mt-2 md:mt-4">
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

  const select = (optionId: string) =>
    onAnswer(q.type === "multi" ? nextMultiValue(q, userValue, optionId) : userValue === optionId ? undefined : optionId);

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
