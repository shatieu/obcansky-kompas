"use client";

import { useMemo, useState, type FormEvent } from "react";
import { STORAGE_KEY, loadCompassState } from "@/lib/compass-storage";
import { composeStatement, isAnswered, QUESTION_IDS } from "@/lib/compose";
import { CONTENT_VERSION } from "@/lib/content";
import type { SignTexts } from "@/lib/sign/texts";
import { clearEditSession, EDIT_SESSION_KEY, loadEditSession } from "./edit-session";
import { Icon } from "./icon";
import { Notice, PocBadge } from "./notice";
import { CheckField } from "./select-mark";
import { btnPrimary, btnSecondary, h2, hint, input, label, sticky } from "./styles";
import { Turnstile } from "./turnstile";
import { useStored } from "./use-stored";

type Mode = "open" | "static" | "read_only";
type Result = { kind: "poc"; url: string } | { kind: "sent" } | null;

const relative = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
};

/**
 * /kompas/podpis (SPEC §7.1): text složený z odpovědí v prohlížeči, formulář, souhlas, Turnstile.
 * Odpovědi zůstávají v localStorage i při chybě – nic se neztratí (SPEC §14.2).
 * S rozpracovanou úpravou (token z e-mailu v sessionStorage) místo formuláře „Uložit změny“.
 */
export function SignForm({ t, mode, siteKey }: { t: SignTexts["sign"]; mode: Mode; siteKey: string }) {
  const raw = useStored("local", STORAGE_KEY);
  const editRaw = useStored("session", EDIT_SESSION_KEY);
  const state = useMemo(() => (raw === undefined ? null : loadCompassState()), [raw]);
  const edit = useMemo(() => (editRaw === undefined ? null : loadEditSession()), [editRaw]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [showName, setShowName] = useState<boolean | null>(null);
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState("");
  const [widget, setWidget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  if (!state) return <div className="min-h-40" aria-busy />;

  const answers = state.answers;
  const hasAnswers = QUESTION_IDS.some((q) => isAnswered(answers[q]));
  if (!hasAnswers) {
    return (
      <section className="mt-8">
        <h2 className={h2}>{t.no_answers_title}</h2>
        <p className="mt-2">{t.no_answers_lead}</p>
        <div className={`${sticky} mt-6`}>
          <a href="/kompas" className={btnPrimary}>
            {t.compass_button}
            <Icon name="arrow-right" />
          </a>
        </div>
      </section>
    );
  }

  const statement = composeStatement(answers, CONTENT_VERSION, { hideUnknown: state.hideUnknown });
  const d = state.demographics;
  const effectiveShowName = showName ?? edit?.showName ?? false;

  const statementBlock = (
    <section aria-labelledby="muj-text" className="mt-6 bg-blue-tint p-4">
      <h2 id="muj-text" className="text-[13px] font-bold uppercase leading-4 tracking-[0.08em]">
        {t.statement_title}
      </h2>
      <p className="mt-3 text-[17px] leading-[26px]">{statement.text}</p>
      <a href="/kompas#q1" className={`${btnSecondary} mt-2`}>
        {t.edit_answers_button}
      </a>
    </section>
  );

  async function post(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> } | null> {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
    } catch {
      return null;
    }
  }

  const demographics = { region: d.region ?? null, ageGroup: d.ageGroup ?? null, municipalitySize: d.municipalitySize ?? null, comment: d.comment ?? null };

  // ---------- Úprava existujícího podpisu ----------
  if (edit) {
    const save = async () => {
      setBusy(true);
      setErr(null);
      const r = await post("/api/sign/edit", { token: edit.token, answers, showName: effectiveShowName, ...demographics });
      setBusy(false);
      if (r && r.status < 300 && typeof r.json.url === "string") {
        clearEditSession();
        window.location.assign(r.json.url);
        return;
      }
      setErr(typeof r?.json.message === "string" ? r.json.message : t.unavailable);
    };
    return (
      <>
        <h2 className={`${h2} mt-8`}>{t.edit_save_title}</h2>
        <p className="mt-2">{t.edit_save_lead}</p>
        {statementBlock}
        <div className="mt-6">
          <CheckField name="showName" checked={effectiveShowName} onChange={setShowName}>
            {t.show_name_label}
          </CheckField>
        </div>
        {err && (
          <div className="mt-4">
            <Notice role="alert">{err}</Notice>
          </div>
        )}
        <div className={`${sticky} mt-6`}>
          <button type="button" className={btnPrimary} disabled={busy || mode !== "open"} onClick={save}>
            {busy ? t.sending : t.edit_save_button}
            <Icon name="arrow-right" />
          </button>
        </div>
        <button
          type="button"
          className={`${btnSecondary} mt-2`}
          onClick={() => {
            clearEditSession();
            window.location.assign(`/v/${edit.signatureId}`);
          }}
        >
          {t.edit_cancel_button}
        </button>
      </>
    );
  }

  // ---------- Hotovo ----------
  if (result) {
    return (
      <>
        {statementBlock}
        <section className="mt-8" role="status" aria-live="polite">
          {result.kind === "poc" ? (
            <>
              <PocBadge label={t.poc_label} />
              <h2 className={`${h2} mt-3`}>{t.sent_title}</h2>
              <p className="mt-2">{t.poc_lead}</p>
              <p className="mt-3 break-all text-[15px] leading-[22px] text-muted">{result.url}</p>
              <div className={`${sticky} mt-6`}>
                <a href={relative(result.url)} className={btnPrimary}>
                  {t.poc_verify_button}
                  <Icon name="arrow-right" />
                </a>
              </div>
            </>
          ) : (
            <>
              <Icon name="mail" size={32} />
              <h2 className={`${h2} mt-3`}>{t.sent_title}</h2>
              <p className="mt-2">{t.sent_lead}</p>
            </>
          )}
        </section>
      </>
    );
  }

  // ---------- Formulář ----------
  const blocked = mode === "static" ? t.static_demo : mode === "read_only" ? t.read_only : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    if (!token) {
      setErr(t.turnstile_wait);
      return;
    }
    setBusy(true);
    setErr(null);
    const r = await post("/api/sign", {
      name,
      email,
      showName: effectiveShowName,
      address: address || null,
      consent,
      answers,
      contentVersion: CONTENT_VERSION,
      ...demographics,
      turnstileToken: token,
    });
    setBusy(false);
    if (r && r.status < 300) {
      setResult(typeof r.json.verifyUrl === "string" ? { kind: "poc", url: r.json.verifyUrl } : { kind: "sent" });
      return;
    }
    // Turnstile token je jednorázový – po každém pokusu nový.
    setToken("");
    setWidget((w) => w + 1);
    setErr(typeof r?.json.message === "string" ? r.json.message : t.unavailable);
  };

  return (
    <>
      {statementBlock}
      {blocked ? (
        <div className="mt-8">
          <Notice role="status" tone="info">
            {blocked}
          </Notice>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-6" noValidate={false}>
          <div>
            <label htmlFor="sign-name" className={label}>
              {t.name_label}
            </label>
            <input id="sign-name" name="name" required maxLength={100} autoComplete="name" className={`${input} mt-2`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sign-email" className={label}>
              {t.email_label}
            </label>
            <input
              id="sign-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              inputMode="email"
              aria-describedby="sign-email-hint"
              className={`${input} mt-2`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p id="sign-email-hint" className={hint}>
              {t.email_hint}
            </p>
          </div>
          <CheckField name="showName" checked={effectiveShowName} onChange={setShowName} hint={t.show_name_hint}>
            {t.show_name_label}
          </CheckField>
          <div>
            <label htmlFor="sign-address" className={label}>
              {t.address_label}
            </label>
            <input id="sign-address" name="address" maxLength={200} autoComplete="street-address" aria-describedby="sign-address-hint" className={`${input} mt-2`} value={address} onChange={(e) => setAddress(e.target.value)} />
            <p id="sign-address-hint" className={hint}>
              {t.address_hint}
            </p>
          </div>
          <CheckField
            name="consent"
            required
            checked={consent}
            onChange={setConsent}
            hint={
              <>
                {t.consent_hint}{" "}
                <a href="/soukromi" className="underline">
                  {t.privacy_link}
                </a>
              </>
            }
          >
            {t.consent_label}
          </CheckField>
          <Turnstile key={widget} siteKey={siteKey} onToken={setToken} label={t.turnstile_label} />
          {err && <Notice role="alert">{err}</Notice>}
          <div className={sticky}>
            <button type="submit" className={btnPrimary} disabled={busy}>
              {busy ? t.sending : t.submit_button}
              <Icon name="arrow-right" />
            </button>
          </div>
        </form>
      )}
    </>
  );
}
