"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSignatureAnswers } from "@/components/akce/signature-answers";
import type { ZakonTexts } from "@/components/akce/texts";
import { ErrorNote, Icon, ScreenHeading, StickyBar, btnPrimary, btnText } from "@/components/akce/ui";
import { loadCompassState } from "@/lib/compass-storage";
import type { Answers } from "@/lib/compose/types";
import { lawFileBase, lawMetaLines } from "@/lib/export/law-meta";
import { composeLawFromCompass, type LawContent } from "@/lib/law";

interface Source {
  kind: "signature" | "browser";
  answers: Answers;
  contentVersion: string;
}

/**
 * Můj zákon (SPEC §10): přehled na obrazovce (paragrafy za rozbalením), plné znění jen v PDF
 * a DOCX, které vznikají v prohlížeči (pdf-lib, docx se načtou až po kliknutí).
 */
export function LawView({
  uuid,
  date,
  content,
  texts,
  initial,
  browserContentVersion,
}: {
  uuid: string;
  date: string;
  /** Verze obsahu kompasu, se kterou se skládají odpovědi z prohlížeče. */
  browserContentVersion: string;
  content: LawContent;
  texts: ZakonTexts;
  initial: { answers: Answers; contentVersion: string } | null;
}) {
  const [source, setSource] = useState<Source | null>(initial ? { kind: "signature", ...initial } : null);
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    // HOOK(signature-api): bez DB na serveru zkusit API, jinak odpovědi z prohlížeče.
    fetchSignatureAnswers(uuid).then((s) => {
      if (cancelled) return;
      if (s) setSource({ kind: "signature", answers: s.answers, contentVersion: s.contentVersion ?? browserContentVersion });
      else {
        const st = loadCompassState();
        setSource({ kind: "browser", answers: st.answers, contentVersion: browserContentVersion });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initial, uuid, browserContentVersion]);

  const law = useMemo(() => {
    if (!source) return null;
    return composeLawFromCompass(source.answers, source.contentVersion || "–", { content, date, uuid });
  }, [source, content, date, uuid]);

  if (!law || !source) {
    return (
      <div className="mx-auto max-w-[688px] px-[16px]">
        <ScreenHeading kicker={texts.kicker} title={content.base.title} />
        <p className="pb-[48px]">{texts.loading}</p>
      </div>
    );
  }

  const empty = Object.keys(source.answers).length === 0;
  const fileBase = lawFileBase(texts.file_base, uuid);

  const download = async (kind: "pdf" | "docx") => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      const { saveBytes, MIME } = await import("@/lib/export/download");
      if (kind === "pdf") {
        const [{ buildLawPdf }, { loadPdfFonts }] = await Promise.all([import("@/lib/export/law-pdf"), import("@/lib/export/fonts")]);
        const bytes = await buildLawPdf(law, await loadPdfFonts(), { creator: texts.pdf_creator, pageLabel: texts.pdf_page });
        saveBytes(bytes, `${fileBase}.pdf`, MIME.pdf);
      } else {
        const { buildLawDocx } = await import("@/lib/export/law-docx");
        const bytes = await buildLawDocx(law, { creator: texts.pdf_creator, pageLabel: texts.pdf_page });
        saveBytes(bytes, `${fileBase}.docx`, MIME.docx);
      }
    } catch (e) {
      console.error(e);
      setError(texts.error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[688px] px-[16px]">
      <ScreenHeading kicker={texts.kicker} title={law.header.lawTitle} lead={texts.lead} />

      {law.workingDraftLabel && (
        <p className="flex items-start gap-[12px] border-l-4 border-ink bg-blue-tint py-[12px] pr-[16px] pl-[12px] font-wide text-[15px] leading-[20px] font-bold tracking-[0.04em] uppercase">
          <Icon name="alert" className="shrink-0" />
          <span>{law.workingDraftLabel}</span>
        </p>
      )}
      <p className="mt-[12px] font-semibold">{law.disclaimer}</p>
      <p className="mt-[8px] text-[14px] leading-[20px] font-medium text-ink-secondary">
        {source.kind === "signature" ? texts.source_signature : empty ? texts.source_empty : texts.source_browser}
      </p>

      <section aria-label={texts.meta_title_section} className="mt-[24px] border-t-2 border-ink pt-[12px]">
        <ul className="text-[14px] leading-[20px] font-medium break-words text-ink-secondary">
          {lawMetaLines(law).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="zakon-obsah" className="mt-[24px] border-t-2 border-ink pt-[24px] pb-[16px]">
        <h2 id="zakon-obsah" className="font-wide text-[22px] leading-[26px] font-bold tracking-[-0.01em]">
          {texts.contents_title}
        </h2>
        {law.parts.map((part) => (
          <div key={part.id} className="mt-[24px]">
            <h3 className="font-wide text-[13px] leading-[16px] font-bold tracking-[0.08em] uppercase">
              {part.label} · {part.title}
            </h3>
            <div className="mt-[8px]">
              {part.paragraphs.map((p) => (
                <details key={p.id} className="group border-t-2 border-ink last:border-b-2">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-[16px] px-[4px] py-[8px] hover:bg-blue-tint focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="font-semibold tabular">{p.label}</span>
                      {p.title && <span className="font-semibold">{` ${p.title}`}</span>}
                      {p.isPlaceholder && <span className="block text-[14px] leading-[20px] font-medium text-ink-secondary">{texts.placeholder_tag}</span>}
                    </span>
                    <span className="shrink-0 group-open:hidden">
                      <Icon name="plus" />
                    </span>
                    <span className="hidden shrink-0 group-open:inline">
                      <Icon name="minus" />
                    </span>
                  </summary>
                  <div className="bg-blue-tint px-[16px] py-[12px] text-[17px] leading-[26px]">
                    {p.subsections.map((s, i) => (
                      <div key={i} className={i > 0 ? "mt-[8px]" : undefined}>
                        <p>
                          {s.label && <span className="tabular">{s.label} </span>}
                          {s.text}
                        </p>
                        {s.points.length > 0 && (
                          <ul className="mt-[4px] pl-[24px]">
                            {s.points.map((pt) => (
                              <li key={pt.label}>
                                <span className="tabular">{pt.label}</span> {pt.text}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>

      {error && <ErrorNote>{error}</ErrorNote>}
      <StickyBar>
        <div className="flex flex-col items-stretch gap-[4px] md:flex-row md:items-center md:gap-[24px]">
          <button type="button" className={btnPrimary} aria-busy={busy === "pdf"} disabled={busy !== null} onClick={() => download("pdf")}>
            <span>{busy === "pdf" ? texts.working : texts.pdf_button}</span>
            <Icon name="download" />
          </button>
          <button type="button" className={`${btnText} justify-center`} aria-busy={busy === "docx"} disabled={busy !== null} onClick={() => download("docx")}>
            <span>{busy === "docx" ? texts.working : texts.docx_button}</span>
          </button>
        </div>
      </StickyBar>
      <div className="h-[32px]" />
    </div>
  );
}
