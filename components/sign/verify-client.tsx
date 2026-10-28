"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SignTexts } from "@/lib/sign/texts";
import type { ShortIdTexts } from "@/lib/sign/lookup-texts";
import { ShortIdBadge } from "@/components/lookup/short-id-badge";
import { Button, ButtonLink, StickyBar } from "@/components/ui/button";
import { FlagUnfold } from "@/components/ui/flag-unfold";
import { ScreenHeading } from "@/components/ui/typography";
import { WaitBar } from "@/components/ui/wait-bar";

type State =
  | { s: "working" }
  | { s: "done"; url: string; shortId: string | null }
  | { s: "used"; url: string | null; shortId: string | null }
  | { s: "expired" }
  | { s: "invalid" }
  | { s: "unavailable"; message: string };

/** Po rozvinutí vlajky (800 ms) pokračuje na osobní stránku – klepnutím nebo samo po 1,5 s. */
const AUTO_CONTINUE_MS = 800 + 1500;
const AUTO_CONTINUE_WITH_ID_MS = 800 + 6000;

/**
 * /overeni/[token]: token se spotřebuje až POSTem z prohlížeče (ne samotným otevřením odkazu,
 * které umí udělat i náhled v poště). Hotovo = noční plakátová plocha FlagUnfold (pohyb.md §2).
 */
export function VerifyClient({ token, t, shortIdTexts }: { token: string; t: SignTexts["verify"]; shortIdTexts?: ShortIdTexts }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ s: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/sign/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
        const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string; shortId?: string };
        const shortId = typeof json.shortId === "string" ? json.shortId : null;
        if (res.ok && json.url) setState({ s: "done", url: json.url, shortId });
        else if (res.status === 409) setState({ s: "used", url: json.url ?? null, shortId });
        else if (res.status === 410) setState({ s: "expired" });
        else if (res.status === 404) setState({ s: "invalid" });
        else setState({ s: "unavailable", message: json.message ?? t.invalid_lead });
      } catch {
        setState({ s: "unavailable", message: t.invalid_lead });
      }
    })();
  }, [token, t.invalid_lead]);

  const go = useCallback(() => {
    if (state.s === "done") router.replace(state.url);
  }, [router, state]);

  useEffect(() => {
    if (state.s !== "done") return;
    // S číslem podpisu na obrazovce déle (stihnout si ho přečíst); je pak i na osobní stránce.
    const id = window.setTimeout(go, state.shortId && shortIdTexts ? AUTO_CONTINUE_WITH_ID_MS : AUTO_CONTINUE_MS);
    return () => window.clearTimeout(id);
  }, [state, go, shortIdTexts]);

  if (state.s === "working")
    return (
      <div className="py-6">
        <WaitBar label={t.working} />
        <p className="mt-2" aria-live="polite">
          {t.working}
        </p>
      </div>
    );
  if (state.s === "done")
    return (
      <FlagUnfold fixed headingLevel={1} title={t.done_title} text={t.done_lead} onContinue={go}>
        {state.shortId && shortIdTexts && <ShortIdBadge className="mt-3" shortId={state.shortId} texts={shortIdTexts} />}
        <Button
          className="mt-4"
          iconEnd="arrow-right"
          onClick={(e) => {
            e.stopPropagation();
            go();
          }}
        >
          {t.continue_button}
        </Button>
      </FlagUnfold>
    );

  const [title, lead, href, cta] =
    state.s === "used"
      ? [t.used_title, t.used_lead, state.url, t.continue_button]
      : state.s === "expired"
        ? [t.expired_title, t.expired_lead, "/kompas/podpis", t.sign_again_button]
        : state.s === "invalid"
          ? [t.invalid_title, t.invalid_lead, "/kompas/podpis", t.sign_again_button]
          : [t.invalid_title, state.message, null, null];
  return (
    <section className="max-w-main py-4 lg:py-6">
      <ScreenHeading title={title} lead={lead} />
      {state.s === "used" && state.shortId && shortIdTexts && <ShortIdBadge className="mt-3" shortId={state.shortId} texts={shortIdTexts} />}
      {href && cta && (
        <StickyBar className="mt-4">
          <ButtonLink href={href} block iconEnd="arrow-right">
            {cta}
          </ButtonLink>
        </StickyBar>
      )}
    </section>
  );
}
