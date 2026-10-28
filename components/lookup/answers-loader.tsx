"use client";

import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { TextInput } from "@/components/ui/fields";
import { Notice } from "@/components/ui/typography";
import { loadCompassState, saveCompassState, withLoadedAnswers, type CompassState } from "@/lib/compass-storage";
import type { Answers } from "@/lib/compose/types";
import type { LookupTexts } from "@/lib/sign/lookup-texts";
import { formatShortId, parseLookupCode } from "@/lib/sign/short-id";

/** Výsledek GET /api/signature/lookup (jen veřejná data podpisu). */
export interface LoadedSignature {
  uuid: string;
  shortId: string;
  answers: Answers;
  contentVersion: string;
}

type Status = { s: "idle" } | { s: "busy" } | { s: "error"; message: string } | { s: "done"; sig: LoadedSignature };

/**
 * Okno „Načíst moje odpovědi“ (líný chunk – na /kompas se stáhne až po klepnutí na odkaz).
 * Číslo podpisu nebo odkaz z e-mailu → GET /api/signature/lookup → odpovědi do localStorage
 * (lib/compass-storage, stejný tvar) → `onLoaded`. Nedává žádná práva k úpravě podpisu.
 */
export default function AnswersLoader({
  texts,
  onLoaded,
  onClose,
}: {
  texts: LookupTexts;
  onLoaded?: (state: CompassState, sig: LoadedSignature) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ s: "idle" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status.s === "busy") return;
    if (!code.trim()) return setStatus({ s: "error", message: texts.empty });
    // Zjevně neplatný vstup se nepošle (nespotřebuje rate limit).
    if (!parseLookupCode(code)) return setStatus({ s: "error", message: texts.invalid });
    setStatus({ s: "busy" });
    try {
      const res = await fetch(`/api/signature/lookup?code=${encodeURIComponent(code.trim())}`, { cache: "no-store", headers: { accept: "application/json" } });
      const body = (await res.json().catch(() => null)) as { uuid?: unknown; short_id?: unknown; answers?: unknown; content_version?: unknown } | null;
      if (res.ok && body && typeof body.uuid === "string" && body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)) {
        const sig: LoadedSignature = {
          uuid: body.uuid,
          shortId: typeof body.short_id === "string" ? body.short_id : "",
          answers: body.answers as Answers,
          contentVersion: typeof body.content_version === "string" ? body.content_version : "",
        };
        const state = withLoadedAnswers(loadCompassState(), sig.answers);
        saveCompassState(state);
        setStatus({ s: "done", sig });
        onLoaded?.(state, sig);
        return;
      }
      const message =
        res.status === 404 ? texts.not_found : res.status === 400 ? texts.invalid : res.status === 429 ? texts.rate_limited : texts.unavailable;
      setStatus({ s: "error", message });
    } catch {
      setStatus({ s: "error", message: texts.unavailable });
    }
  };

  if (status.s === "done") {
    return (
      <Notice tone="info" role="status" className="max-w-main">
        <p className="font-semibold" data-testid="lookup-done">
          {texts.done_title}
          {status.sig.shortId && <span className="k-num font-normal"> · {formatShortId(status.sig.shortId)}</span>}
        </p>
        <p>{texts.done_lead}</p>
        <ButtonLink href={`/v/${status.sig.uuid}`} variant="secondary" iconEnd="arrow-right" className="-ml-1 mt-1">
          {texts.open_page_button}
        </ButtonLink>
      </Notice>
    );
  }

  return (
    <section aria-labelledby="lookup-title" className="max-w-main border-t-2 border-ink pt-2">
      <h2 id="lookup-title" className="k-h k-h3">
        {texts.title}
      </h2>
      <p className="k-cap mt-0.5">{texts.lead}</p>
      <form className="mt-2" onSubmit={submit} noValidate>
        <TextInput
          label={texts.input_label}
          hint={texts.input_hint}
          name="code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (status.s === "error") setStatus({ s: "idle" });
          }}
          error={status.s === "error" ? status.message : undefined}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={600}
          autoFocus
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" iconEnd="arrow-right" disabled={status.s === "busy"}>
            {texts.submit_button}
          </Button>
          <button type="button" className="k-link" onClick={onClose}>
            {texts.cancel_button}
          </button>
        </div>
        <p className="k-sr" aria-live="polite">
          {status.s === "busy" ? texts.loading : ""}
        </p>
      </form>
    </section>
  );
}
