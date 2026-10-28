"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchSignatureAnswers } from "@/components/akce/signature-answers";
import type { ZakonTexts } from "@/components/akce/texts";
import { Button, StickyBar } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Notice, ScreenHeading, SectionTitle } from "@/components/ui/typography";
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
      <div className="k-wrap">
        <div className="mx-auto max-w-main pt-3 pb-6 lg:pt-6">
          <ScreenHeading kicker={texts.kicker} title={content.base.title} />
          <p className="mt-3">{texts.loading}</p>
        </div>
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
    <div className="k-wrap">
      <div className="mx-auto max-w-main pt-3 pb-3 lg:pt-6">
        <ScreenHeading kicker={texts.kicker} title={law.header.lawTitle} lead={texts.lead} />

        {law.workingDraftLabel && (
          <Notice role="note" className="mt-3 bg-blue-tint py-1.5 pr-2">
            <span className="font-wide text-kicker uppercase">{law.workingDraftLabel}</span>
          </Notice>
        )}
        <p className="mt-2 font-semibold">{law.disclaimer}</p>
        <p className="k-cap mt-1">
          {source.kind === "signature" ? texts.source_signature : empty ? texts.source_empty : texts.source_browser}
        </p>

        <section aria-label={texts.meta_title_section} className="mt-3 border-t-2 border-ink pt-1.5">
          <ul className="k-cap break-words">
            {lawMetaLines(law).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="zakon-obsah" className="mt-3 border-t-2 border-ink pt-3 pb-2">
          <SectionTitle id="zakon-obsah">{texts.contents_title}</SectionTitle>
          {law.parts.map((part) => (
            <div key={part.id} className="mt-3">
              <h3 className="k-kicker">
                {part.label} · {part.title}
              </h3>
              <div className="mt-1">
                {part.paragraphs.map((p) => (
                  <details key={p.id} className="group border-t-2 border-ink last:border-b-2">
                    <summary className="flex min-h-answer cursor-pointer list-none items-center justify-between gap-2 px-0.5 py-1 hover:bg-blue-tint focus-visible:-outline-offset-3 [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="k-num font-semibold">{p.label}</span>
                        {p.title && <span className="font-semibold">{` ${p.title}`}</span>}
                        {p.isPlaceholder && <span className="k-cap block">{texts.placeholder_tag}</span>}
                      </span>
                      <span className="shrink-0 group-open:hidden">
                        <Icon name="plus" />
                      </span>
                      <span className="hidden shrink-0 group-open:inline">
                        <Icon name="minus" />
                      </span>
                    </summary>
                    <div className="k-letter">
                      {p.subsections.map((s, i) => (
                        <div key={i} className={i > 0 ? "mt-1" : undefined}>
                          <p>
                            {s.label && <span className="k-num">{s.label} </span>}
                            {s.text}
                          </p>
                          {s.points.length > 0 && (
                            <ul className="mt-0.5 pl-3">
                              {s.points.map((pt) => (
                                <li key={pt.label}>
                                  <span className="k-num">{pt.label}</span> {pt.text}
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

        {error && (
          <Notice role="alert" className="mb-2">
            {error}
          </Notice>
        )}
        <StickyBar>
          <Button block icon="download" aria-busy={busy === "pdf" || undefined} disabled={busy !== null} onClick={() => download("pdf")}>
            {busy === "pdf" ? texts.working : texts.pdf_button}
          </Button>
          <Button variant="secondary" aria-busy={busy === "docx" || undefined} disabled={busy !== null} onClick={() => download("docx")}>
            {busy === "docx" ? texts.working : texts.docx_button}
          </Button>
        </StickyBar>
      </div>
    </div>
  );
}
