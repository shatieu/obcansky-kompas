"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SignTexts } from "@/lib/sign/texts";
import { FlagUnfold } from "./flag-unfold";
import { Icon } from "./icon";
import { btnPrimary, h1, sticky } from "./styles";

type State =
  | { s: "working" }
  | { s: "done"; url: string }
  | { s: "used"; url: string | null }
  | { s: "expired" }
  | { s: "invalid" }
  | { s: "unavailable"; message: string };

/** Po rozvinutí vlajky (800 ms) pokračuje na osobní stránku – klepnutím nebo samo po 1,5 s. */
const AUTO_CONTINUE_MS = 800 + 1500;

/**
 * /overeni/[token]: token se spotřebuje až POSTem z prohlížeče (ne samotným otevřením odkazu,
 * které umí udělat i náhled v poště).
 */
export function VerifyClient({ token, t }: { token: string; t: SignTexts["verify"] }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ s: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/sign/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
        const json = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
        if (res.ok && json.url) setState({ s: "done", url: json.url });
        else if (res.status === 409) setState({ s: "used", url: json.url ?? null });
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
    const id = window.setTimeout(go, AUTO_CONTINUE_MS);
    return () => window.clearTimeout(id);
  }, [state, go]);

  if (state.s === "working") return <p className="py-12" aria-live="polite">{t.working}</p>;
  if (state.s === "done") return <FlagUnfold title={t.done_title} text={t.done_lead} onContinue={go} continueLabel={t.continue_button} />;

  const [title, lead, href, cta] =
    state.s === "used"
      ? [t.used_title, t.used_lead, state.url, t.continue_button]
      : state.s === "expired"
        ? [t.expired_title, t.expired_lead, "/kompas/podpis", t.sign_again_button]
        : state.s === "invalid"
          ? [t.invalid_title, t.invalid_lead, "/kompas/podpis", t.sign_again_button]
          : [t.invalid_title, state.message, null, null];
  return (
    <section className="py-8 md:py-12">
      <h1 className={h1}>{title}</h1>
      <p className="mt-3">{lead}</p>
      {href && cta && (
        <div className={`${sticky} mt-8`}>
          <a href={href} className={btnPrimary}>
            {cta}
            <Icon name="arrow-right" />
          </a>
        </div>
      )}
    </section>
  );
}
