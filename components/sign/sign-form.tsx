"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { STORAGE_KEY, loadCompassState } from "@/lib/compass-storage";
import { composeStatement, isAnswered, QUESTION_IDS } from "@/lib/compose";
import { CONTENT_VERSION } from "@/lib/content";
import type { SignTexts } from "@/lib/sign/texts";
import { Button, ButtonLink, StickyBar } from "@/components/ui/button";
import { Checkbox, TextInput, Toggle } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { SampleBadge } from "@/components/ui/sample";
import { Notice, SectionTitle } from "@/components/ui/typography";
import { clearEditSession, EDIT_SESSION_KEY, loadEditSession } from "./edit-session";
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
 * Rozvržení podle obrazovky „Podpis“: prohlášení na ploše (k-letter), od 1024 px dva sloupce 688 + 448.
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

  if (!state) return <div className="min-h-[160px]" aria-busy />;

  const answers = state.answers;
  const hasAnswers = QUESTION_IDS.some((q) => isAnswered(answers[q]));
  if (!hasAnswers) {
    return (
      <section className="mt-4 max-w-main">
        <SectionTitle>{t.no_answers_title}</SectionTitle>
        <p className="k-lede">{t.no_answers_lead}</p>
        <StickyBar className="mt-3">
          <ButtonLink href="/kompas" block iconEnd="arrow-right">
            {t.compass_button}
          </ButtonLink>
        </StickyBar>
      </section>
    );
  }

  const statement = composeStatement(answers, CONTENT_VERSION, { hideUnknown: state.hideUnknown });
  const d = state.demographics;
  const effectiveShowName = showName ?? edit?.showName ?? false;

  const statementBlock = (
    <section aria-labelledby="muj-text">
      <div className="k-letter">
        <h2 id="muj-text" className="k-letter__meta">
          {t.statement_title}
        </h2>
        <p className="mt-1">{statement.text}</p>
      </div>
      <ButtonLink href="/kompas#text" variant="secondary" className="mt-1">
        {t.edit_answers_button}
      </ButtonLink>
    </section>
  );
  /** Dva sloupce od 1024 px: prohlášení 688 + formulář 448. */
  const twoCol = (side: ReactNode) => (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,688px)_minmax(0,448px)] lg:gap-6">
      {statementBlock}
      <div className="min-w-0">{side}</div>
    </div>
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
    return twoCol(
      <div className="flex flex-col gap-2">
        <div>
          <SectionTitle>{t.edit_save_title}</SectionTitle>
          <p className="k-lede">{t.edit_save_lead}</p>
        </div>
        <Toggle label={t.show_name_label} hint={t.show_name_hint} checked={effectiveShowName} onChange={setShowName} name="showName" />
        {err && <Notice role="alert">{err}</Notice>}
        <StickyBar>
          <Button block iconEnd="arrow-right" disabled={busy || mode !== "open"} aria-busy={busy || undefined} onClick={save}>
            {busy ? t.sending : t.edit_save_button}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearEditSession();
              window.location.assign(`/v/${edit.signatureId}`);
            }}
          >
            {t.edit_cancel_button}
          </Button>
        </StickyBar>
      </div>,
    );
  }

  // ---------- Hotovo ----------
  if (result) {
    return twoCol(
      <section role="status" aria-live="polite" className="flex flex-col gap-2">
        {result.kind === "poc" ? (
          <>
            <div>
              <SampleBadge>{t.poc_label}</SampleBadge>
            </div>
            <SectionTitle>{t.sent_title}</SectionTitle>
            <p>{t.poc_lead}</p>
            <p className="k-cap break-all">{result.url}</p>
            <StickyBar>
              <ButtonLink href={relative(result.url)} block iconEnd="arrow-right">
                {t.poc_verify_button}
              </ButtonLink>
            </StickyBar>
          </>
        ) : (
          <>
            <Icon name="mail" size={32} />
            <SectionTitle>{t.sent_title}</SectionTitle>
            <p>{t.sent_lead}</p>
          </>
        )}
      </section>,
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

  return twoCol(
    blocked ? (
      <Notice role="status" tone="info">
        {blocked}
      </Notice>
    ) : (
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextInput label={t.name_label} name="name" required maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextInput
          label={t.email_label}
          hint={t.email_hint}
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Toggle label={t.show_name_label} hint={t.show_name_hint} checked={effectiveShowName} onChange={setShowName} name="showName" />
        <TextInput
          label={t.address_label}
          hint={t.address_hint}
          name="address"
          maxLength={200}
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Checkbox
          name="consent"
          required
          checked={consent}
          onChange={setConsent}
          label={t.consent_label}
          caption={
            <>
              {t.consent_hint}{" "}
              <a href="/soukromi" className="underline">
                {t.privacy_link}
              </a>
            </>
          }
        />
        <Turnstile key={widget} siteKey={siteKey} onToken={setToken} label={t.turnstile_label} />
        {err && <Notice role="alert">{err}</Notice>}
        <StickyBar>
          <Button type="submit" block iconEnd="arrow-right" disabled={busy} aria-busy={busy || undefined}>
            {busy ? t.sending : t.submit_button}
          </Button>
        </StickyBar>
      </form>
    ),
  );
}
