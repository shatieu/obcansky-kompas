"use client";

import { useState, type FormEvent } from "react";
import type { SignTexts } from "@/lib/sign/texts";
import { Button, ButtonLink } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/fields";
import { SampleBadge } from "@/components/ui/sample";
import { Notice } from "@/components/ui/typography";
import { Turnstile } from "./turnstile";

type PageTexts = SignTexts["page"];

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> } | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return null;
  }
}

/** „Pošli mi odkaz pro úpravu“ (SPEC §7.3). V POC se odkaz ukáže tady. Akce je sekundární (na stránce je primární „Sdílet“). */
export function ManageLinkForm({ t, siteKey, disabledMessage }: { t: PageTexts; siteKey: string; disabledMessage: string | null }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [widget, setWidget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; url: string | null } | null>(null);

  if (disabledMessage) return <Notice tone="info">{disabledMessage}</Notice>;
  if (done) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-start gap-1">
        {done.url && <SampleBadge>{t.poc_badge}</SampleBadge>}
        <p>{done.message}</p>
        {done.url && (
          <ButtonLink href={new URL(done.url, window.location.href).pathname} variant="secondary" iconEnd="arrow-right">
            {t.manage_poc_button}
          </ButtonLink>
        )}
      </div>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await postJson("/api/edit-link", { email, turnstileToken: token });
    setBusy(false);
    if (r?.ok) {
      setDone({ message: String(r.json.message ?? t.manage_sent), url: typeof r.json.editUrl === "string" ? r.json.editUrl : null });
      return;
    }
    setToken("");
    setWidget((w) => w + 1);
    setErr(typeof r?.json.message === "string" ? r.json.message : t.unavailable_lead);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <TextInput label={t.manage_email_label} type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      <Turnstile key={widget} siteKey={siteKey} onToken={setToken} label={t.manage_button} />
      {err && <Notice role="alert">{err}</Notice>}
      <Button type="submit" variant="secondary" icon="mail" className="self-start" disabled={busy || !token} aria-busy={busy || undefined}>
        {t.manage_button}
      </Button>
    </form>
  );
}

/** „Nahlásit“ komentář – e-mail spolku (SPEC §7.3). */
export function ReportForm({ t, id, siteKey }: { t: PageTexts; id: string; siteKey: string }) {
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState("");
  const [token, setToken] = useState("");
  const [widget, setWidget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) return <p role="status">{t.report_sent}</p>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await postJson("/api/report", { id, reason, contact: contact || null, turnstileToken: token });
    setBusy(false);
    if (r?.ok) {
      setSent(true);
      return;
    }
    setToken("");
    setWidget((w) => w + 1);
    setErr(typeof r?.json.message === "string" ? r.json.message : t.unavailable_lead);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <h3 className="k-h k-h2">{t.report_title}</h3>
      <p className="k-cap">{t.report_lead}</p>
      <TextArea label={t.report_reason_label} required minLength={3} maxLength={1000} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
      <TextInput label={t.report_contact_label} maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
      <Turnstile key={widget} siteKey={siteKey} onToken={setToken} label={t.report_button} />
      {err && <Notice role="alert">{err}</Notice>}
      <Button type="submit" variant="secondary" className="self-start" disabled={busy || !token} aria-busy={busy || undefined}>
        {t.report_button}
      </Button>
    </form>
  );
}
