"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/disclosure";
import { StickmanPreview } from "@/components/demonstrace/stickman/stickman-preview";
import { sloganText, type CrowdPerson } from "@/lib/crowd/data";
import { fill, formatDay, formatRank } from "@/lib/crowd/format";
import type { CrowdTexts } from "@/lib/crowd/texts";
import { Turnstile } from "@/components/sign/turnstile";
import { TEST_SITE_KEY } from "@/lib/turnstile";
import { CrowdShareButton } from "./share-button";

/** Klíč Turnstile pro klienta (NEXT_PUBLIC_ se vkládá při buildu); bez něj testovací (POC/vývoj). */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY;

/**
 * Karta panáčka (SPEC-demonstrace §6.2): jméno nebo „Anonym“, slogan, pořadí, datum připojení,
 * „Sdílet“ a „Nahlásit“. Dialog (BottomSheet): fokus na nadpis, Escape zavře, fokus se vrátí.
 */
export function CrowdCard({
  person,
  texts,
  presets,
  defaultPreset,
  onClose,
  onReport,
}: {
  /** Karta potřebuje id (sdílení, nahlášení) – dlaždice ho nenesou, CrowdView ho dotáhne. */
  person: CrowdPerson & { id: string };
  texts: CrowdTexts["card"];
  presets: Record<string, string>;
  defaultPreset: string;
  onClose: () => void;
  onReport: (id: string, turnstileToken: string) => Promise<boolean>;
}) {
  // „Nahlásit“ → ověření Turnstile → po tokenu se nahlášení odešle samo (bezpečnostní review).
  const [report, setReport] = useState<"idle" | "verify" | "busy" | "done" | "error">("idle");
  const [widget, setWidget] = useState(0);
  const slogan = sloganText(person.slogan, presets, defaultPreset);
  const url = typeof window === "undefined" ? `/demonstrace/${person.id}` : new URL(`/demonstrace/${encodeURIComponent(person.id)}`, window.location.origin).toString();

  const doReport = async (token: string) => {
    if (!token) return;
    setReport("busy");
    try {
      setReport((await onReport(person.id, token)) ? "done" : "error");
    } catch {
      setReport("error");
    }
    setWidget((w) => w + 1); // token je jednorázový
  };

  return (
    <BottomSheet open title={person.name ?? texts.anonymous} onClose={onClose} closeLabel={texts.close}>
      <div className="flex items-start gap-2">
        <StickmanPreview
          className="h-[166px] w-[150px] flex-none"
          seed={person.seed}
          pose={person.pose}
          signColor={person.signColor}
          signText={slogan}
          title={person.signColor === "none" ? texts.figure_label_no_sign : fill(texts.figure_label, { slogan })}
        />
        <div className="min-w-0">
          {/* Panáček bez cedule může být i bez sloganu – pak jen pořadí a datum. */}
          {slogan && <p className="k-h k-h3 m-0">„{slogan}“</p>}
          <p className="k-stat-m mt-1">{formatRank(person.index, texts.rank)}</p>
          {person.joinedDay && <p className="k-cap mt-1">{fill(texts.joined, { date: formatDay(person.joinedDay) })}</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <CrowdShareButton person={person} url={url} label={texts.share_button} copiedLabel={texts.copied} />
        {report === "done" ? (
          <p className="k-cap" role="status">
            {texts.reported}
          </p>
        ) : (
          <>
            {report === "verify" || report === "busy" ? (
              <>
                <p className="k-cap m-0">{texts.report_verify}</p>
                <Turnstile key={widget} siteKey={SITE_KEY} onToken={(t) => void doReport(t)} label={texts.report_button} />
              </>
            ) : (
              <Button variant="secondary" className="self-start" onClick={() => setReport("verify")}>
                {texts.report_button}
              </Button>
            )}
            {report === "error" && (
              <p className="k-cap" role="alert">
                {texts.report_error}
              </p>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
