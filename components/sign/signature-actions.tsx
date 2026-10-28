"use client";

import { useState, type FormEvent } from "react";
import type { SignTexts } from "@/lib/sign/texts";
import { Icon } from "./icon";
import { Notice, PocBadge } from "./notice";
import { btnPrimary, btnSecondary, h2, hint, input, label, sticky } from "./styles";
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

/** Primární akce „Sdílet“: Web Share API, jinak zkopírování odkazu. */
export function ShareButton({ t, title }: { t: PageTexts; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href.split("#")[0]!.split("?")[0]!;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* zrušené sdílení */
    }
  };
  return (
    <div className={sticky}>
      <button type="button" className={btnPrimary} onClick={share}>
        {t.share_button}
        <Icon name="share" />
      </button>
      {copied && (
        <p role="status" className="mt-2 text-[15px] leading-[22px]">
          {t.share_copied}
        </p>
      )}
    </div>
  );
}

/** „Pošlete mi odkaz pro úpravu“ (SPEC §7.3). V POC se odkaz ukáže tady. */
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
      <div role="status" aria-live="polite">
        {done.url && <PocBadge label={t.poc_badge} />}
        <p className="mt-3">{done.message}</p>
        {done.url && (
          <a href={new URL(done.url, window.location.href).pathname} className={`${btnSecondary} mt-2`}>
            {t.manage_poc_button}
            <Icon name="arrow-right" />
          </a>
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="manage-email" className={label}>
          {t.manage_email_label}
        </label>
        <input id="manage-email" type="email" required autoComplete="email" maxLength={254} className={`${input} mt-2`} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Turnstile key={widget} siteKey={siteKey} onToken={setToken} label={t.manage_button} />
      {err && <Notice role="alert">{err}</Notice>}
      <button type="submit" className={`${btnSecondary} self-start`} disabled={busy || !token}>
        <Icon name="mail" />
        {t.manage_button}
      </button>
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h3 className={h2}>{t.report_title}</h3>
      <p className={hint}>{t.report_lead}</p>
      <div>
        <label htmlFor="report-reason" className={label}>
          {t.report_reason_label}
        </label>
        <textarea id="report-reason" required minLength={3} maxLength={1000} rows={4} className={`${input} mt-2 py-3`} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div>
        <label htmlFor="report-contact" className={label}>
          {t.report_contact_label}
        </label>
        <input id="report-contact" maxLength={200} className={`${input} mt-2`} value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <Turnstile key={widget} siteKey={siteKey} onToken={setToken} label={t.report_button} />
      {err && <Notice role="alert">{err}</Notice>}
      <button type="submit" className={`${btnSecondary} self-start`} disabled={busy || !token}>
        {t.report_button}
      </button>
    </form>
  );
}
