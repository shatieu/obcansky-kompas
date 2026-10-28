"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from "react";
import { loadCompassState } from "@/lib/compass-storage";
import { composeStatement, currentContentVersion } from "@/lib/compose";
import type { Answers } from "@/lib/compose/types";
import {
  krajRecipient,
  obecRecipient,
  poslanecRecipient,
  resolveObvod,
  senateChoice,
  senatorRecipient,
  staticRecipient,
  type Recipient,
} from "@/lib/export/recipients";
import { formatDateCz, mailtoHref, splitAddress } from "@/lib/export/text";
import { ADDRESSEE_TYPES, composeLetter, type AddresseeType, type ComposedLetter, type LettersContent } from "@/lib/letters";
import { reportLetterPrepared } from "./events";
import type { AkceDirectories } from "./load-directories";
import { ObecPicker } from "./obec-picker";
import { fetchSignatureAnswers, isUuid } from "./signature-answers";
import { CUSTOM_MAX, defaultPrefs, loadPrefs, newSeed, parseStyle, savePrefs, writeStyle, type AkcePrefs, type StyleParams } from "./state";
import { fill, type AkceTexts } from "./texts";
import {
  CheckRow,
  ErrorNote,
  Icon,
  ScreenHeading,
  SectionTitle,
  StepSlider,
  StickyBar,
  actionRow,
  btnPrimary,
  btnText,
  fieldHint,
  fieldLabel,
  inputBase,
} from "./ui";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Source {
  kind: "signature" | "browser";
  answers: Answers;
  contentVersion: string;
}

/** Jádro dopisu = věty podepsaného textu k jednotlivým otázkám (bez úvodu, závěru a „Nevím“). */
function statementSentences(src: Source): string[] {
  let st;
  try {
    st = composeStatement(src.answers, src.contentVersion, { hideUnknown: true });
  } catch {
    st = composeStatement(src.answers, currentContentVersion(), { hideUnknown: true });
  }
  return st.parts.filter((p) => p.questionId !== null).map((p) => p.text);
}

interface TypeBlock {
  type: AddresseeType;
  recipients: Recipient[];
  /** Proč zatím nejsou adresáti (chybí kraj, obec…). */
  blocked: string | null;
}

function SelectField({
  label,
  placeholder,
  value,
  options,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <span className="relative mt-[8px] block">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block min-h-[56px] w-full appearance-none border-2 border-ink bg-surface py-[12px] pr-[48px] pl-[16px] text-[17px] text-ink focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-focus"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className="pointer-events-none absolute top-1/2 right-[16px] -translate-y-1/2" />
      </span>
    </div>
  );
}

export function LettersTool({ texts, letters, dirs }: { texts: AkceTexts; letters: LettersContent; dirs: AkceDirectories }) {
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [style, setStyle] = useState<StyleParams>({ forma: 2, delka: 2, seed: "0" });
  const [prefs, setPrefs] = useState<AkcePrefs>(defaultPrefs);
  const [openPreview, setOpenPreview] = useState<Record<string, boolean>>({});
  const [showPoslanci, setShowPoslanci] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Načtení: styl z URL, volby a odpovědi z prohlížeče (před vykreslením, ať se obsah neprobliká).
  useIsoLayoutEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const parsed = parseStyle(search);
    const st: StyleParams = { forma: parsed.forma, delka: parsed.delka, seed: parsed.seed ?? newSeed() };
    setStyle(st);
    const p = loadPrefs();
    const compass = loadCompassState();
    const browser: Source = { kind: "browser", answers: compass.answers, contentVersion: currentContentVersion() };
    const region = compass.demographics.region;
    if (!p.kraj && region && dirs.kraje.some((k) => k.code === region)) p.kraj = region;
    setPrefs(p);

    const sig = search.get("sig");
    if (isUuid(sig)) {
      fetchSignatureAnswers(sig).then((s) => {
        if (s) {
          setSource({ kind: "signature", answers: s.answers, contentVersion: s.contentVersion ?? currentContentVersion() });
          if (s.region && dirs.kraje.some((k) => k.code === s.region)) setPrefs((cur) => (cur.kraj ? cur : { ...cur, kraj: s.region }));
        } else setSource(browser);
        setReady(true);
      });
    } else {
      setSource(browser);
      setReady(true);
    }
  }, [dirs.kraje]);

  // Styl → URL (bez navigace, bez serveru).
  useEffect(() => {
    if (!ready) return;
    const next = writeStyle(new URLSearchParams(window.location.search), style);
    const url = `${window.location.pathname}?${next.toString()}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", url);
  }, [ready, style]);

  useEffect(() => {
    if (ready) savePrefs(prefs);
  }, [ready, prefs]);

  const update = useCallback((patch: Partial<AkcePrefs>) => setPrefs((p) => ({ ...p, ...patch })), []);

  const sentences = useMemo(() => (source ? statementSentences(source) : []), [source]);

  /* ---------------------------------------------------------- adresáti */
  const kraj = dirs.kraje.find((k) => k.code === prefs.kraj) ?? null;
  const poslanciKraje = useMemo(() => dirs.poslanci.filter((p) => p.kraj_code === prefs.kraj), [dirs.poslanci, prefs.kraj]);
  const obvod = prefs.obec ? resolveObvod(prefs.obec, prefs.castKod, prefs.obvodPick) : null;
  const choice = prefs.obec ? senateChoice(prefs.obec, prefs.castKod) : null;

  const blocks: TypeBlock[] = useMemo(() => {
    return prefs.types.map((type): TypeBlock => {
      switch (type) {
        case "poslanec":
          if (!kraj) return { type, recipients: [], blocked: texts.needs_region };
          if (poslanciKraje.length === 0) return { type, recipients: [], blocked: texts.poslanci_none };
          return {
            type,
            recipients: poslanciKraje.filter((p) => !prefs.poslanciOff.includes(p.id)).map((p) => poslanecRecipient(p, texts.postal)),
            blocked: null,
          };
        case "senator": {
          if (!kraj) return { type, recipients: [], blocked: texts.needs_region };
          if (!prefs.obec) return { type, recipients: [], blocked: texts.needs_obec };
          if (obvod === null) return { type, recipients: [], blocked: texts.needs_obvod };
          const s = dirs.senatori.find((x) => x.obvod_cislo === obvod);
          return s ? { type, recipients: [senatorRecipient(s, texts.postal)], blocked: null } : { type, recipients: [], blocked: texts.senator_missing };
        }
        case "kraj":
          return kraj ? { type, recipients: [krajRecipient(kraj, texts.postal)], blocked: null } : { type, recipients: [], blocked: texts.needs_region };
        case "obec":
          if (!kraj) return { type, recipients: [], blocked: texts.needs_region };
          return prefs.obec ? { type, recipients: [obecRecipient(prefs.obec, texts.postal)], blocked: null } : { type, recipients: [], blocked: texts.needs_obec };
        case "ministr-kultury":
          return { type, recipients: [staticRecipient(type, dirs.static.ministr_kultury)], blocked: null };
        case "prezident":
          return { type, recipients: [staticRecipient(type, dirs.static.prezident)], blocked: null };
      }
    });
  }, [prefs, kraj, poslanciKraje, obvod, dirs, texts]);

  const composed = useMemo(() => {
    const out = new Map<AddresseeType, ComposedLetter>();
    if (sentences.length === 0) return out;
    for (const b of blocks) {
      out.set(
        b.type,
        composeLetter(
          {
            addressee: b.type,
            statementSentences: sentences,
            forma: style.forma,
            delka: style.delka,
            seed: style.seed,
            includeProcessBlock: prefs.process,
            customSentence: prefs.custom.trim() || undefined,
            includeFooter: prefs.footer,
            senderName: prefs.senderName.trim() || undefined,
          },
          letters,
        ),
      );
    }
    return out;
  }, [blocks, sentences, style, prefs.process, prefs.custom, prefs.footer, prefs.senderName, letters]);

  const allRecipients = blocks.flatMap((b) => (composed.has(b.type) ? b.recipients.map((r) => ({ r, letter: composed.get(b.type)! })) : []));

  /* ------------------------------------------------------------ exporty */
  const sender = [prefs.senderName.trim(), ...splitAddress(prefs.senderAddress)].filter(Boolean);

  const makePdf = async (r: Recipient, letter: ComposedLetter): Promise<Uint8Array> => {
    const [{ buildLetterPdf }, { loadPdfFonts }] = await Promise.all([import("@/lib/export/letter-pdf"), import("@/lib/export/fonts")]);
    return buildLetterPdf(
      {
        recipient: r.postal,
        sender,
        date: formatDateCz(new Date()),
        subject: texts.pdf_subject,
        body: letter.text,
        title: `${letter.addresseeLabel} – ${r.name}`,
        creator: texts.pdf_creator,
        pageLabel: texts.pdf_page,
      },
      await loadPdfFonts(),
    );
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setError(texts.error);
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = (r: Recipient, letter: ComposedLetter) =>
    run(`pdf:${r.key}`, async () => {
      const bytes = await makePdf(r, letter);
      const { saveBytes, MIME } = await import("@/lib/export/download");
      saveBytes(bytes, `${r.fileBase}.pdf`, MIME.pdf);
      reportLetterPrepared(r.type);
    });

  const downloadZip = () =>
    run("zip", async () => {
      const entries = [];
      for (const { r, letter } of allRecipients) entries.push({ name: `${r.fileBase}.pdf`, data: await makePdf(r, letter) });
      const [{ buildZip }, { saveBytes, MIME }] = await Promise.all([import("@/lib/export/zip"), import("@/lib/export/download")]);
      saveBytes(buildZip(entries), texts.file_zip, MIME.zip);
      for (const t of new Set(allRecipients.map((x) => x.r.type))) reportLetterPrepared(t);
    });

  const copy = async (type: AddresseeType, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied((c) => (c === type ? null : c)), 2500);
      reportLetterPrepared(type);
    } catch {
      setCopied(null);
      setOpenPreview((o) => ({ ...o, [type]: true }));
      setError(texts.copy_failed);
    }
  };

  /* -------------------------------------------------------------- render */
  if (!ready) {
    return (
      <div className="mx-auto max-w-[688px] px-[16px]">
        <ScreenHeading kicker={texts.kicker} title={texts.title} />
        <p className="pb-[48px]">{texts.loading}</p>
      </div>
    );
  }

  if (sentences.length === 0) {
    return (
      <div className="mx-auto max-w-[688px] px-[16px] pb-[48px]">
        <ScreenHeading kicker={texts.kicker} title={texts.empty_title} lead={texts.empty_lead} />
        <Link href="/kompas" className={`${btnPrimary} no-underline`}>
          <span>{texts.empty_button}</span>
          <Icon name="arrow-right" />
        </Link>
      </div>
    );
  }

  const typeLabel = (t: AddresseeType) => letters.types[t].label;
  const needsPlace = prefs.types.some((t) => t !== "ministr-kultury" && t !== "prezident");
  const formaSteps = letters.common.forma_levels.map((l) => l.label);
  const delkaSteps = letters.common.delka_levels.map((l) => l.label);

  return (
    <div className="mx-auto max-w-[688px] px-[16px]">
      <ScreenHeading kicker={texts.kicker} title={texts.title} lead={texts.lead} />
      <p className="-mt-[8px] mb-[24px] text-[14px] leading-[20px] font-medium text-ink-secondary">
        {source?.kind === "signature" ? texts.source_signature : texts.source_browser}
      </p>

      {/* ------------------------------------------------ Komu */}
      <section aria-labelledby="akce-komu" className="border-t-2 border-ink pt-[24px] pb-[32px]">
        <SectionTitle id="akce-komu">{texts.to_title}</SectionTitle>
        <p className="mt-[8px]">{texts.to_lead}</p>
        <div className="mt-[16px] flex flex-col gap-[8px]">
          {ADDRESSEE_TYPES.map((type) => {
            const checked = prefs.types.includes(type);
            return (
              <div key={type}>
                <CheckRow
                  label={typeLabel(type)}
                  caption={texts.captions[type]}
                  checked={checked}
                  onChange={(on) => update({ types: on ? ADDRESSEE_TYPES.filter((t) => t === type || prefs.types.includes(t)) : prefs.types.filter((t) => t !== type) })}
                />
                {type === "poslanec" && checked && poslanciKraje.length > 0 && (
                  <fieldset className="mt-[8px] ml-[16px] border-l-2 border-ink pl-[16px]">
                    <legend className="sr-only">{typeLabel(type)}</legend>
                    <div className="flex flex-wrap items-center justify-between gap-x-[16px]">
                      <span className="text-[14px] leading-[20px] font-medium" aria-live="polite">
                        {fill(texts.poslanci_selected, {
                          n: poslanciKraje.filter((p) => !prefs.poslanciOff.includes(p.id)).length,
                          total: poslanciKraje.length,
                        })}
                      </span>
                      <button
                        type="button"
                        className={btnText}
                        aria-expanded={showPoslanci}
                        aria-controls="akce-poslanci"
                        onClick={() => setShowPoslanci((v) => !v)}
                      >
                        {showPoslanci ? texts.poslanci_hide_button : texts.poslanci_edit_button}
                      </button>
                    </div>
                    {showPoslanci && (
                    <div id="akce-poslanci" className="mt-[8px] flex flex-col gap-[4px]">
                      <div>
                        {prefs.poslanciOff.some((id) => poslanciKraje.some((p) => p.id === id)) ? (
                          <button type="button" className={btnText} onClick={() => update({ poslanciOff: [] })}>
                            {texts.poslanci_select_all}
                          </button>
                        ) : (
                          <button type="button" className={btnText} onClick={() => update({ poslanciOff: poslanciKraje.map((p) => p.id) })}>
                            {texts.poslanci_select_none}
                          </button>
                        )}
                      </div>
                      {poslanciKraje.map((p) => {
                        const r = poslanecRecipient(p, texts.postal);
                        const on = !prefs.poslanciOff.includes(p.id);
                        return (
                          <CheckRow
                            key={p.id}
                            compact
                            label={r.name}
                            caption={r.detail ?? undefined}
                            checked={on}
                            onChange={(v) => update({ poslanciOff: v ? prefs.poslanciOff.filter((x) => x !== p.id) : [...prefs.poslanciOff, p.id] })}
                          />
                        );
                      })}
                    </div>
                    )}
                  </fieldset>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------ Kde bydlíš */}
      {needsPlace && (
        <section aria-labelledby="akce-kde" className="border-t-2 border-ink pt-[24px] pb-[32px]">
          <SectionTitle id="akce-kde">{texts.where_title}</SectionTitle>
          <div className="mt-[16px] flex flex-col gap-[24px]">
            <SelectField
              label={texts.region_label}
              placeholder={texts.region_placeholder}
              value={prefs.kraj ?? ""}
              options={dirs.kraje.map((k) => ({ value: k.code, label: k.name }))}
              onChange={(v) => update({ kraj: v || null, obec: null, castKod: null, obvodPick: null })}
            />
            {kraj && (prefs.types.includes("senator") || prefs.types.includes("obec")) && (
              <ObecPicker key={kraj.code} kraj={kraj.code} texts={texts} value={prefs.obec} onChange={(o) => update({ obec: o, castKod: null, obvodPick: null })} />
            )}
            {prefs.obec && prefs.types.includes("senator") && choice && choice.casti.length > 0 && (
              <SelectField
                label={texts.cast_label}
                placeholder={texts.cast_placeholder}
                value={prefs.castKod === null ? "" : String(prefs.castKod)}
                options={choice.casti.map((c) => ({ value: String(c.kod), label: c.nazev }))}
                onChange={(v) => update({ castKod: v ? Number(v) : null, obvodPick: null })}
              />
            )}
            {prefs.obec && prefs.types.includes("senator") && choice && choice.obvody.length > 1 && (
              <SelectField
                label={texts.obvod_label}
                placeholder={texts.obvod_placeholder}
                value={prefs.obvodPick === null ? "" : String(prefs.obvodPick)}
                options={choice.obvody.map((n) => ({
                  value: String(n),
                  label: fill(texts.obvod_option, { n, name: dirs.senatori.find((s) => s.obvod_cislo === n)?.obvod_nazev ?? "" }).replace(/ – $/, ""),
                }))}
                onChange={(v) => update({ obvodPick: v ? Number(v) : null })}
              />
            )}
          </div>
        </section>
      )}

      {/* ------------------------------------------------ Styl */}
      <section aria-labelledby="akce-styl" className="border-t-2 border-ink pt-[24px] pb-[32px]">
        <SectionTitle id="akce-styl">{texts.style_title}</SectionTitle>
        <div className="mt-[16px] flex flex-col gap-[24px]">
          <StepSlider label={texts.forma_label} steps={formaSteps} value={style.forma - 1} onChange={(i) => setStyle((s) => ({ ...s, forma: (i + 1) as 1 | 2 | 3 }))} />
          <StepSlider label={texts.delka_label} steps={delkaSteps} value={style.delka - 1} onChange={(i) => setStyle((s) => ({ ...s, delka: (i + 1) as 1 | 2 | 3 }))} />
          <div>
            <button type="button" className={btnText} onClick={() => setStyle((s) => ({ ...s, seed: newSeed(s.seed) }))}>
              <Icon name="refresh" />
              <span>{texts.variant_button}</span>
            </button>
          </div>
          <div className="flex flex-col gap-[8px]">
            <CheckRow label={letters.common.process_block.title} checked={prefs.process} onChange={(v) => update({ process: v })} />
            <CheckRow label={fill(texts.footer_label, { footer: letters.common.footer })} checked={prefs.footer} onChange={(v) => update({ footer: v })} />
          </div>
          <label className="block">
            <span className={fieldLabel}>{texts.custom_label}</span>
            <span className={fieldHint}>{texts.custom_hint}</span>
            <textarea
              rows={3}
              maxLength={CUSTOM_MAX}
              value={prefs.custom}
              onChange={(e) => update({ custom: e.target.value.replace(/[\r\n]+/g, " ") })}
              className={`${inputBase} resize-y`}
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>{texts.sender_name_label}</span>
            <input type="text" autoComplete="name" maxLength={120} value={prefs.senderName} onChange={(e) => update({ senderName: e.target.value })} className={inputBase} />
          </label>
          <label className="block">
            <span className={fieldLabel}>{texts.sender_address_label}</span>
            <input
              type="text"
              autoComplete="street-address"
              maxLength={200}
              value={prefs.senderAddress}
              onChange={(e) => update({ senderAddress: e.target.value })}
              className={inputBase}
            />
          </label>
          <p className={fieldHint}>{texts.private_hint}</p>
        </div>
      </section>

      {/* ------------------------------------------------ Dopisy */}
      <section aria-labelledby="akce-dopisy" className="border-t-2 border-ink pt-[24px] pb-[16px]">
        <SectionTitle id="akce-dopisy">{texts.letters_title}</SectionTitle>
        {error && <ErrorNote>{error}</ErrorNote>}
        {blocks.length === 0 && <p className="mt-[8px]">{texts.letters_empty}</p>}
        <div className="mt-[16px] flex flex-col gap-[32px]">
          {blocks.map((b) => {
            const letter = composed.get(b.type);
            return (
              <article key={b.type} aria-labelledby={`akce-typ-${b.type}`} className="bg-blue-tint px-[16px] pt-[16px] pb-[8px]">
                <h3 id={`akce-typ-${b.type}`} className="text-[19px] leading-[24px] font-semibold">
                  {typeLabel(b.type)}
                </h3>
                {b.blocked && <p className="mt-[8px] pb-[8px]">{b.blocked}</p>}
                {letter && b.recipients.length > 0 && (
                  <>
                    <div className="mt-[12px]">
                      <button
                        type="button"
                        className={actionRow}
                        aria-expanded={Boolean(openPreview[b.type])}
                        aria-controls={`akce-text-${b.type}`}
                        onClick={() => setOpenPreview((o) => ({ ...o, [b.type]: !o[b.type] }))}
                      >
                        <span>{openPreview[b.type] ? texts.hide_letter : texts.show_letter}</span>
                        <Icon name={openPreview[b.type] ? "minus" : "plus"} />
                      </button>
                      {openPreview[b.type] && (
                        <div id={`akce-text-${b.type}`} className="border-t-2 border-ink bg-surface px-[16px] py-[16px] text-[17px] leading-[26px] whitespace-pre-wrap">
                          {letter.text}
                        </div>
                      )}
                      <button type="button" className={actionRow} onClick={() => copy(b.type, letter.text)}>
                        <span aria-live="polite">{copied === b.type ? texts.copied : texts.copy_button}</span>
                        <Icon name="copy" />
                      </button>
                    </div>
                    <ul className="mt-[16px] flex flex-col gap-[16px]">
                      {b.recipients.map((r) => (
                        <li key={r.key} className="border-t-4 border-ink bg-surface px-[12px] pt-[12px]">
                          <p className="font-semibold">{r.name}</p>
                          {r.detail && <p className="text-[14px] leading-[20px] font-medium text-ink-secondary">{r.detail}</p>}
                          <div className="mt-[8px]">
                            {r.email ? (
                              <a className={actionRow} href={mailtoHref(r.email, texts.mail_subject, letter.text)} onClick={() => reportLetterPrepared(r.type)}>
                                <span>{texts.mail_button}</span>
                                <Icon name="mail" />
                              </a>
                            ) : (
                              r.dataBox === null && <p className="border-t-2 border-ink py-[12px] text-[15px] leading-[22px]">{texts.no_email}</p>
                            )}
                            <button type="button" className={actionRow} aria-busy={busy === `pdf:${r.key}`} disabled={busy !== null} onClick={() => downloadPdf(r, letter)}>
                              <span>{busy === `pdf:${r.key}` ? texts.working : texts.pdf_button}</span>
                              <Icon name="download" />
                            </button>
                          </div>
                          {r.dataBox && (
                            <div className="border-t-2 border-ink py-[12px]">
                              <p className="font-semibold tabular">{fill(texts.databox_label, { id: r.dataBox })}</p>
                              <ol className="mt-[4px] list-decimal pl-[24px] text-[15px] leading-[22px]">
                                {texts.databox_howto.map((line) => (
                                  <li key={line}>{line}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-[12px] pb-[8px] text-[14px] leading-[20px] font-medium">{texts.post_hint}</p>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {allRecipients.length > 0 && (
        <StickyBar>
          <button type="button" className={btnPrimary} aria-busy={busy === "zip"} disabled={busy !== null} onClick={downloadZip}>
            <span className="flex flex-col items-start text-left">
              <span>{busy === "zip" ? texts.working : texts.zip_button}</span>
              <span className="font-sans text-[14px] leading-[20px] font-medium">{fill(texts.zip_caption, { n: allRecipients.length })}</span>
            </span>
            <Icon name="download" />
          </button>
        </StickyBar>
      )}
      <div className="h-[32px]" />
    </div>
  );
}
