"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnswerGroup, AnswerOption } from "@/components/ui/answer";
import { Button, StickyBar } from "@/components/ui/button";
import { Checkbox, FieldError, TextInput } from "@/components/ui/fields";
import { Kicker, Notice } from "@/components/ui/typography";
import { Icon } from "@/components/ui/icon";
import { StickmanPreview } from "@/components/demonstrace/stickman/stickman-preview";
import { fill } from "@/lib/crowd/format";
import { NAME_MAX, POSES, SIGN_COLORS, SLOGAN_MAX, type ModerationStatus } from "@/lib/demo/constants";
import { scriptCheck } from "@/lib/moderation/script";
import type { JoinTexts } from "./texts";
import {
  canReroll,
  firstInvalid,
  navStates,
  nextStep,
  payload,
  reroll,
  rerollsLeft,
  signText,
  stepError,
  STEPS,
  tidy,
  visibleStatus,
  type CheckText,
  type JoinDraft,
  type Step,
  type StepError,
} from "./state";

/**
 * Průvodce připojením k online demonstraci (SPEC-demonstrace §3): krok za krokem, na mobilu
 * jedna věc na obrazovku, náhled panáčka stále nahoře (animovaný; reduced-motion = klid).
 * Volná navigace mezi kroky jako v kompasu. Odeslání: POST /api/demonstrace/join, u úpravy
 * PATCH /api/demonstrace/[id]; po úspěchu krátké zařazení do davu (≤ 800 ms) → /demonstrace/[id].
 */
export interface EditInfo {
  id: string;
  savedSlogan: string | null;
  savedName: string | null;
  sloganStatus: ModerationStatus;
  nameStatus: ModerationStatus;
}

const check: CheckText = (text, field) => scriptCheck(text, field).ok;

const SWATCH: Record<(typeof SIGN_COLORS)[number], string> = { white: "bg-surface", blue: "bg-blue", red: "bg-red" };

export function JoinFlow({
  texts: t,
  presets,
  initial,
  edit,
}: {
  texts: JoinTexts;
  presets: { id: string; text: string }[];
  initial: JoinDraft;
  edit: EditInfo | null;
}) {
  const presetMap = useMemo(() => Object.fromEntries(presets.map((p) => [p.id, p.text])), [presets]);
  const [draft, setDraft] = useState<JoinDraft>(initial);
  const [step, setStep] = useState<Step>("slogan");
  const [visited, setVisited] = useState<Set<Step>>(() => new Set(edit ? STEPS : ["slogan"]));
  /** Chyby ukázané po pokusu o pokračování (prázdná pole); obsahové chyby se ukazují hned. */
  const [shown, setShown] = useState<Partial<Record<Step, StepError>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const stepTitles: Record<Step, string> = {
    slogan: t.step_slogan,
    pose: t.step_pose,
    color: t.step_color,
    look: t.step_look,
    name: t.step_name,
    consent: t.step_consent,
  };

  const update = (patch: Partial<JoinDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setServerError(null);
  };

  const go = useCallback((s: Step) => {
    setStep(s);
    setVisited((v) => new Set(v).add(s));
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => headingRef.current?.focus());
  }, [step]);

  const errorText = (e: StepError): string | null => {
    switch (e) {
      case "slogan_empty":
        return t.slogan_empty;
      case "name_empty":
        return t.name_empty;
      case "moderation_slogan":
      case "moderation_name":
        return t.moderation;
      case "consent":
        return t.consent_error;
      default:
        return null;
    }
  };

  // Obsahová kontrola (skript) hned při psaní; prázdné pole až po pokusu pokračovat.
  const liveError = (s: Step): string | null => {
    const e = stepError(s, draft, check);
    if (e === "moderation_slogan" || e === "moderation_name") return errorText(e);
    return shown[s] && e ? errorText(e) : null;
  };

  const submit = async () => {
    const bad = firstInvalid(draft, check);
    if (bad) {
      setShown((x) => ({ ...x, [bad.step]: bad.error }));
      go(bad.step);
      return;
    }
    setBusy(true);
    setServerError(null);
    const body = JSON.stringify(payload(draft));
    const send = (method: "POST" | "PATCH", url: string) =>
      fetch(url, { method, headers: { "content-type": "application/json" }, body, credentials: "same-origin" });
    try {
      let res = edit ? await send("PATCH", `/api/demonstrace/${edit.id}`) : await send("POST", "/api/demonstrace/join");
      let data = (await res.json().catch(() => ({}))) as { id?: string; error?: string; field?: string };
      if (res.status === 409 && data.id) {
        // Už v davu (např. jiná záložka) – stejné volby se uloží jako úprava, místo zůstává.
        res = await send("PATCH", `/api/demonstrace/${data.id}`);
        data = (await res.json().catch(() => ({}))) as typeof data;
      }
      if (res.ok && data.id) {
        setJoined(data.id);
        return;
      }
      if (data.error === "moderation") {
        const s: Step = data.field === "firstName" ? "name" : "slogan";
        setShown((x) => ({ ...x, [s]: s === "name" ? "moderation_name" : "moderation_slogan" }));
        setServerError(t.moderation);
        go(s);
      } else if (data.error === "consent") {
        setShown((x) => ({ ...x, consent: "consent" }));
        go("consent");
      } else if (data.error === "rate_limited") setServerError(t.error_rate_limited);
      else if (data.error === "unauthorized") setServerError(t.error_unauthorized);
      else if (data.error === "static_demo") setServerError(t.static_demo);
      else if (data.error === "read_only") setServerError(t.read_only);
      else setServerError(t.error_generic);
    } catch {
      setServerError(t.error_generic);
    } finally {
      setBusy(false);
    }
  };

  const onPrimary = () => {
    const e = stepError(step, draft, check);
    if (e) {
      setShown((x) => ({ ...x, [step]: e }));
      return;
    }
    const n = nextStep(step);
    if (n) go(n);
    else void submit();
  };

  const sign = signText(draft, presetMap);
  const isLast = step === "consent";
  const sloganStatus = edit ? visibleStatus(edit.sloganStatus, edit.savedSlogan, draft.sloganMode === "custom" ? draft.custom : "") : null;
  const nameStatus = edit ? visibleStatus(edit.nameStatus, edit.savedName, draft.showName ? draft.firstName : "") : null;
  const states = navStates(step, visited, draft, check);

  if (joined) return <Joining texts={t} draft={draft} sign={sign} href={`/demonstrace/${joined}`} />;

  return (
    <div className="k-wrap pt-2 pb-4 lg:pt-4 lg:pb-6">
      <div className="mx-auto max-w-content">
        <Kicker className="m-0">{edit ? t.edit_kicker : t.kicker}</Kicker>
        <StepNav texts={t} titles={stepTitles} states={states} current={STEPS.indexOf(step)} onSelect={(i) => go(STEPS[i]!)} />

        <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* Náhled: na mobilu nahoře nad krokem, na desktopu vlevo a přilepený. */}
          <div className="sticky top-0 z-20 -mx-2 flex justify-center border-b-2 border-ink bg-blue-tint py-1 lg:top-3 lg:mx-0 lg:border-b-0 lg:py-4">
            <StickmanPreview
              className="h-[176px] w-[158px] lg:h-[400px] lg:w-[360px]"
              seed={draft.seed}
              pose={draft.pose}
              signColor={draft.signColor}
              signText={sign}
              title={fill(t.preview_label, { slogan: sign })}
            />
          </div>

          <div className="mt-3 min-w-0 lg:mt-0">
            {step === "slogan" && (
              <AnswerGroup legend={t.slogan_title} lede={t.slogan_lead} headingRef={headingRef}>
                {presets.map((p) => (
                  <AnswerOption
                    key={p.id}
                    label={p.text}
                    selected={draft.sloganMode === "preset" && draft.presetId === p.id}
                    onSelect={() => update({ sloganMode: "preset", presetId: p.id })}
                  />
                ))}
                <AnswerOption label={t.slogan_custom_option} selected={draft.sloganMode === "custom"} onSelect={() => update({ sloganMode: "custom" })} />
                {draft.sloganMode === "custom" && (
                  <div className="mt-1">
                    <StatusTag status={sloganStatus} texts={t} />
                    <TextInput
                      label={t.slogan_custom_label}
                      hint={`${t.slogan_custom_hint} ${fill(t.slogan_counter, { n: Math.max(0, SLOGAN_MAX - Array.from(draft.custom).length) })}`}
                      value={draft.custom}
                      maxLength={SLOGAN_MAX}
                      autoComplete="off"
                      error={liveError("slogan") ?? undefined}
                      onChange={(e) => update({ custom: e.target.value })}
                    />
                  </div>
                )}
                {draft.sloganMode === "preset" && liveError("slogan") && <FieldError>{liveError("slogan")}</FieldError>}
              </AnswerGroup>
            )}

            {step === "pose" && (
              <AnswerGroup legend={t.pose_title} lede={t.pose_lead} headingRef={headingRef}>
                {POSES.map((p) => (
                  <AnswerOption key={p} label={t.poses[p]} selected={draft.pose === p} onSelect={() => update({ pose: p })} />
                ))}
              </AnswerGroup>
            )}

            {step === "color" && (
              <AnswerGroup legend={t.color_title} lede={t.color_lead} headingRef={headingRef}>
                {SIGN_COLORS.map((c) => (
                  <AnswerOption
                    key={c}
                    label={
                      <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true" className={`inline-block h-3 w-4 flex-none border-2 border-ink ${SWATCH[c]}`} />
                        {t.colors[c]}
                      </span>
                    }
                    selected={draft.signColor === c}
                    onSelect={() => update({ signColor: c })}
                  />
                ))}
              </AnswerGroup>
            )}

            {step === "look" && (
              <section aria-labelledby="join-look">
                <h1 id="join-look" ref={headingRef} tabIndex={-1} className="k-h k-h1 outline-none">
                  {t.look_title}
                </h1>
                <p className="k-lede">{t.look_lead}</p>
                <div className="mt-3">
                  <Button variant="secondary" icon="refresh" onClick={() => update(reroll(draft))} disabled={!canReroll(draft)} aria-describedby="join-reroll">
                    {t.reroll_button}
                  </Button>
                  <p id="join-reroll" className="k-cap mt-1" role="status" aria-live="polite">
                    {canReroll(draft) ? fill(t.reroll_left, { n: rerollsLeft(draft) }) : t.reroll_done}
                  </p>
                </div>
              </section>
            )}

            {step === "name" && (
              <AnswerGroup legend={t.name_title} lede={t.name_lead} headingRef={headingRef}>
                <AnswerOption label={t.name_anonymous} selected={!draft.showName} onSelect={() => update({ showName: false })} />
                <AnswerOption label={t.name_show} selected={draft.showName} onSelect={() => update({ showName: true })} />
                {draft.showName && (
                  <div className="mt-1">
                    <StatusTag status={nameStatus} texts={t} />
                    <TextInput
                      label={t.name_label}
                      hint={t.name_hint}
                      value={draft.firstName}
                      maxLength={NAME_MAX}
                      autoComplete="given-name"
                      error={liveError("name") ?? undefined}
                      onChange={(e) => update({ firstName: e.target.value })}
                    />
                  </div>
                )}
              </AnswerGroup>
            )}

            {step === "consent" && (
              <section aria-labelledby="join-consent">
                <h1 id="join-consent" ref={headingRef} tabIndex={-1} className="k-h k-h1 outline-none">
                  {t.consent_title}
                </h1>
                <p className="k-lede">{t.consent_lead}</p>
                <dl className="mt-3 border-y-2 border-ink">
                  <div className="py-1.5">
                    <dt className="k-cap">{t.summary_slogan}</dt>
                    <dd className="m-0 font-semibold break-words">„{sign}“</dd>
                  </div>
                  <div className="border-t border-rule-soft py-1.5">
                    <dt className="k-cap">{t.summary_name}</dt>
                    <dd className="m-0 font-semibold break-words">{draft.showName && tidy(draft.firstName) ? tidy(draft.firstName) : t.summary_anonymous}</dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <Checkbox
                    label={t.consent_label}
                    caption={t.consent_caption}
                    checked={draft.consent}
                    onChange={(v) => update({ consent: v })}
                    error={shown.consent && !draft.consent ? t.consent_error : undefined}
                  />
                </div>
              </section>
            )}

            {serverError && serverError !== t.moderation && (
              <div className="mt-3">
                <Notice tone="info">{serverError}</Notice>
              </div>
            )}

            <StickyBar className="mt-4">
              <Button variant="primary" block iconEnd="arrow-right" onClick={onPrimary} disabled={busy} aria-busy={busy || undefined}>
                {busy ? t.sending : isLast ? (edit ? t.save_button : t.submit_button) : t.next_button}
              </Button>
            </StickyBar>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusTag({ status, texts: t }: { status: "pending" | "rejected" | null; texts: JoinTexts }) {
  if (!status) return null;
  return (
    <p className="mb-1 flex items-start gap-1" role="status">
      <Icon name={status === "rejected" ? "alert" : "info"} />
      <span>
        <strong className="block">{status === "pending" ? t.status_pending : t.status_rejected}</strong>
        <span className="k-cap">{status === "pending" ? t.status_pending_hint : t.status_rejected_hint}</span>
      </span>
    </p>
  );
}

/** Navigace kroků: stejný vzor jako navigace kompasu (k-qnav, roving tabindex, aria-current). */
function StepNav({
  texts: t,
  titles,
  states,
  current,
  onSelect,
}: {
  texts: JoinTexts;
  titles: Record<Step, string>;
  states: ReturnType<typeof navStates>;
  current: number;
  onSelect: (i: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const total = STEPS.length;
  const stateText = { done: t.nav_state_done, current: t.nav_state_current, todo: t.nav_state_todo };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const target =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? Math.min(i + 1, total - 1)
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? Math.max(i - 1, 0)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? total - 1
              : null;
    if (target === null) return;
    e.preventDefault();
    listRef.current?.querySelectorAll("button")[target]?.focus();
  };
  return (
    <nav aria-label={t.nav_aria} className="mt-1">
      <ol ref={listRef} className="k-qnav" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              className="k-qnav__seg"
              data-s={states[i]}
              aria-current={i === current ? "step" : undefined}
              aria-label={`${fill(t.nav_item, { n: i + 1, total, step: titles[s] })} – ${stateText[states[i]!]}`}
              tabIndex={i === current ? 0 : -1}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onSelect(i)}
            >
              <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <span className="k-qnav__bar" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <div className="k-progress__label">
        <span className="k-kicker" aria-hidden="true">
          {fill(t.progress_label, { n: current + 1, total })} · {titles[STEPS[current]!]}
        </span>
      </div>
    </nav>
  );
}

/**
 * Zařazení do davu: noční plocha, panáček se zmenší a sjede do řady (max. 800 ms),
 * pak přechod na /demonstrace/[id]. Při prefers-reduced-motion bez pohybu, hned dál.
 */
function Joining({ texts: t, draft, sign, href }: { texts: JoinTexts; draft: JoinDraft; sign: string; href: string }) {
  const figRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = reduce ? 0 : 800;
    if (!reduce) {
      figRef.current?.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(0.45)" },
        ],
        { duration: 600, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
      );
    }
    const id = window.setTimeout(() => window.location.assign(href), total);
    return () => window.clearTimeout(id);
  }, [href]);
  return (
    <div className="k-unfold k-night k-unfold--fixed" role="status" aria-live="polite">
      <div className="flex w-full max-w-[480px] flex-col items-center">
        <div ref={figRef} className="origin-bottom">
          <StickmanPreview className="h-[220px] w-[200px]" seed={draft.seed} pose={draft.pose} signColor={draft.signColor} signText={sign} animate={false} />
        </div>
        {/* Řada davu, do které se panáček zařadí. */}
        <div aria-hidden="true" className="mt-1 h-[2px] w-full bg-on-night" />
      </div>
      {/* Zpráva hned (ne až po 600 ms jako u podpisu) – celé zařazení trvá max. 800 ms. */}
      <div className="k-unfold__msg" style={{ animationDelay: "120ms" }}>
        <h1 className="k-h k-display">{t.joining_title}</h1>
        <p>{t.joining_text}</p>
      </div>
    </div>
  );
}
