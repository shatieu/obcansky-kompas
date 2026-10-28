"use client";

import { useState } from "react";
import { saveCompassState } from "@/lib/compass-storage";
import type { Answers, Demographics } from "@/lib/compose/types";
import type { SignTexts } from "@/lib/sign/texts";
import { saveEditSession } from "./edit-session";
import { Icon } from "./icon";
import { Notice } from "./notice";
import { btnPrimary, btnSecondary, h2, sticky } from "./styles";

/**
 * Stránka z odkazu pro úpravu: „Upravit odpovědi“ nahraje uložené odpovědi do kompasu a token
 * do sessionStorage (uloží se na /kompas/podpis), „Odvolat podpis“ smaže osobní údaje.
 */
export function EditPanel({
  t,
  token,
  signature,
  statement,
  readOnly,
}: {
  t: SignTexts["sign"];
  token: string;
  signature: { id: string; answers: Answers; showName: boolean; demographics: Demographics };
  statement: string;
  readOnly: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);

  if (withdrawn) {
    return (
      <section className="mt-8" role="status">
        <h2 className={h2}>{t.withdrawn_title}</h2>
        <p className="mt-2">{t.withdrawn_lead}</p>
      </section>
    );
  }

  const editAnswers = () => {
    saveCompassState({ answers: signature.answers, demographics: signature.demographics, invalidated: [], hideUnknown: false });
    saveEditSession({ token, showName: signature.showName, signatureId: signature.id });
    window.location.assign("/kompas#q1");
  };

  const withdraw = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/withdraw", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) setWithdrawn(true);
      else setErr(json.message ?? t.unavailable);
    } catch {
      setErr(t.unavailable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="mt-6 bg-blue-tint p-4">
        <h2 className="text-[13px] font-bold uppercase leading-4 tracking-[0.08em]">{t.statement_title}</h2>
        <p className="mt-3">{statement}</p>
      </section>
      {readOnly && (
        <div className="mt-6">
          <Notice tone="info">{t.read_only}</Notice>
        </div>
      )}
      <div className={`${sticky} mt-6`}>
        <button type="button" className={btnPrimary} onClick={editAnswers} disabled={readOnly}>
          {t.edit_answers_button}
          <Icon name="arrow-right" />
        </button>
      </div>

      <section className="mt-12 border-t-2 border-ink pt-6">
        <h2 className={h2}>{t.withdraw_title}</h2>
        <p className="mt-2">{t.withdraw_lead}</p>
        {err && (
          <div className="mt-4">
            <Notice role="alert">{err}</Notice>
          </div>
        )}
        {confirming ? (
          <button type="button" className={`${btnSecondary} mt-3`} onClick={withdraw} disabled={busy || readOnly}>
            {t.withdraw_confirm_button}
          </button>
        ) : (
          <button type="button" className={`${btnSecondary} mt-3`} onClick={() => setConfirming(true)} disabled={readOnly}>
            {t.withdraw_button}
          </button>
        )}
      </section>
    </>
  );
}
