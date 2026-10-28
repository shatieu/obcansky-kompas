"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/disclosure";
import { StickmanPreview } from "@/components/demonstrace/stickman/stickman-preview";
import { sloganText, type CrowdPerson } from "@/lib/crowd/data";
import { fill, formatDay, formatRank } from "@/lib/crowd/format";
import type { CrowdTexts } from "@/lib/crowd/texts";
import { CrowdShareButton } from "./share-button";

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
  person: CrowdPerson;
  texts: CrowdTexts["card"];
  presets: Record<string, string>;
  defaultPreset: string;
  onClose: () => void;
  onReport: (id: string) => Promise<boolean>;
}) {
  const [report, setReport] = useState<"idle" | "busy" | "done" | "error">("idle");
  const slogan = sloganText(person.slogan, presets, defaultPreset);
  const url = typeof window === "undefined" ? `/demonstrace/${person.id}` : new URL(`/demonstrace/${encodeURIComponent(person.id)}`, window.location.origin).toString();

  const doReport = async () => {
    setReport("busy");
    try {
      setReport((await onReport(person.id)) ? "done" : "error");
    } catch {
      setReport("error");
    }
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
          title={fill(texts.figure_label, { slogan })}
        />
        <div className="min-w-0">
          <p className="k-h k-h3 m-0">„{slogan}“</p>
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
            <Button variant="secondary" className="self-start" onClick={doReport} aria-busy={report === "busy"} disabled={report === "busy"}>
              {texts.report_button}
            </Button>
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
