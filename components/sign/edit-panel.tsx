"use client";

import { useState } from "react";
import { saveCompassState } from "@/lib/compass-storage";
import type { Answers, Demographics } from "@/lib/compose/types";
import type { SignTexts } from "@/lib/sign/texts";
import { Button, StickyBar } from "@/components/ui/button";
import { Notice, SectionTitle } from "@/components/ui/typography";
import { saveEditSession } from "./edit-session";

/**
 * Stránka z odkazu pro úpravu: „Upravit odpovědi“ nahraje uložené odpovědi do kompasu a token
 * do sessionStorage (uloží se na /kompas/podpis), „Odvolat podpis“ smaže osobní údaje.
 * Jedno primární tlačítko (úprava); odvolání je sekundární textové.
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
      <section className="mt-4" role="status">
        <SectionTitle>{t.withdrawn_title}</SectionTitle>
        <p className="k-lede">{t.withdrawn_lead}</p>
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
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,688px)_minmax(0,448px)] lg:gap-6">
      <section className="k-letter" aria-labelledby="edit-statement">
        <h2 id="edit-statement" className="k-letter__meta">
          {t.statement_title}
        </h2>
        <p className="mt-1">{statement}</p>
      </section>
      <div className="flex min-w-0 flex-col gap-3">
        {readOnly && <Notice tone="info">{t.read_only}</Notice>}
        <StickyBar>
          <Button block iconEnd="arrow-right" onClick={editAnswers} disabled={readOnly}>
            {t.edit_answers_button}
          </Button>
        </StickyBar>

        <section className="border-t-2 border-ink pt-3">
          <SectionTitle>{t.withdraw_title}</SectionTitle>
          <p className="k-lede">{t.withdraw_lead}</p>
          {err && (
            <Notice role="alert" className="mt-2">
              {err}
            </Notice>
          )}
          {confirming ? (
            <Button variant="secondary" className="mt-1" onClick={withdraw} disabled={busy || readOnly} aria-busy={busy || undefined}>
              {t.withdraw_confirm_button}
            </Button>
          ) : (
            <Button variant="secondary" className="mt-1" onClick={() => setConfirming(true)} disabled={readOnly}>
              {t.withdraw_button}
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
