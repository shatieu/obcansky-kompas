"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Button, StickyBar, type ButtonVariant } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/disclosure";
import { Icon } from "@/components/ui/icon";
import type { ShareCard } from "@/lib/share/card";
import { cardShareText } from "@/lib/share/card";
import { reportShare } from "@/lib/share/events";
import { NETWORKS, networkUrl, withMoment } from "@/lib/share/moments";
import type { ClientFormat } from "@/lib/share/layout";
import type { ShareUiTexts } from "@/lib/share/texts";

/**
 * Sdílení (SPEC §9.4): tlačítko „Sdílet“ otevře spodní panel.
 * - Mobil: Web Share API se souborem (Story PNG), když ho prohlížeč umí.
 * - Desktop i mobil: odkazy na sítě (obyčejné URL, žádné skripty třetích stran), kopírovat odkaz, stáhnout.
 * Obrázky Story 1080×1920 a čtverec 1080×1080 vznikají v prohlížeči (canvas) hned po otevření panelu,
 * aby sdílení souboru proběhlo ještě v rámci kliknutí. Odkaz nese `?s=<moment>`.
 */
export type SharePanelTexts = Omit<ShareUiTexts, "image" | "recipients">;

const shareFileName = (moment: string, f: ClientFormat) => `obcansky-kompas-${moment}-${f}.png`;

type Rendered = Record<ClientFormat, { blob: Blob; url: string }>;

export function SharePanel({
  card,
  url,
  texts,
  buttonLabel,
  photo,
  sticky = true,
  variant = "primary",
  defaultOpen = false,
}: {
  card: ShareCard;
  /** Odkaz ke sdílení (cesta nebo absolutní URL), `?s=<moment>` se doplní. */
  url: string;
  texts: SharePanelTexts;
  buttonLabel?: string;
  /** Jen fotka: vlastní fotka z prohlížeče (nikdy se neposílá na server). */
  photo?: Blob | null;
  sticky?: boolean;
  /** "secondary" = textové tlačítko (na stránkách, kde je primární akce jiná). */
  variant?: Extract<ButtonVariant, "primary" | "secondary">;
  /** Otevřít hned (panel načtený až klepnutím na „Sdílet“, např. karta v davu). */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [link, setLink] = useState("");
  const [images, setImages] = useState<Rendered | null>(null);
  const [failed, setFailed] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const linkId = useId();
  const text = cardShareText(card);

  // Obrázky se kreslí až po otevření (písmo a canvas nejsou v JS stránky).
  useEffect(() => {
    if (!open || images) return;
    let cancelled = false;
    (async () => {
      try {
        const { renderShareImage } = await import("@/lib/share/canvas");
        const bitmap = photo ? await createImageBitmap(photo) : undefined;
        const [story, square] = await Promise.all([
          renderShareImage(card, "story", { photo: bitmap }),
          renderShareImage(card, "square", { photo: bitmap }),
        ]);
        if (cancelled) return;
        const next = { story: { blob: story, url: URL.createObjectURL(story) }, square: { blob: square, url: URL.createObjectURL(square) } };
        setImages(next);
        const file = new File([story], shareFileName(card.moment, "story"), { type: "image/png" });
        setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      if (images) for (const i of Object.values(images)) URL.revokeObjectURL(i.url);
    },
    [images],
  );

  // BottomSheet přesune fokus na nadpis, zavře se Escapem a vrátí fokus na tlačítko „Sdílet“.
  const close = useCallback(() => {
    setOpen(false);
    setStatus(null);
  }, []);

  const fileName = (f: ClientFormat) => shareFileName(card.moment, f);

  const shareNative = async () => {
    if (!images) return;
    const file = new File([images.story.blob], fileName("story"), { type: "image/png" });
    try {
      // Některé aplikace u souboru zahodí `url`, proto je odkaz i v textu.
      await navigator.share({ files: [file], title: text, text: `${text} ${link}` });
      reportShare(card.moment);
    } catch {
      /* zrušené sdílení */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus(texts.copied);
      reportShare(card.moment);
    } catch {
      setStatus(texts.copy_failed);
    }
  };

  const openSheet = () => {
    setLink(withMoment(new URL(url, window.location.href).toString(), card.moment));
    setOpen(true);
  };

  const trigger =
    variant === "primary" ? (
      <Button variant="primary" block iconEnd="share" onClick={openSheet} aria-haspopup="dialog" aria-expanded={open}>
        {buttonLabel ?? texts.open_button}
      </Button>
    ) : (
      <Button variant="secondary" icon="share" onClick={openSheet} aria-haspopup="dialog" aria-expanded={open}>
        {buttonLabel ?? texts.open_button}
      </Button>
    );

  return (
    <>
      {sticky && variant === "primary" ? <StickyBar>{trigger}</StickyBar> : trigger}
      <BottomSheet open={open} title={texts.sheet_title} onClose={close} closeLabel={texts.close_button}>
        <p className="k-cap">{texts.sheet_lead}</p>

        <div className="flex justify-center bg-blue-tint p-2">
          {images ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images.square.url} width={1080} height={1080} alt={texts.preview_alt.replace("{text}", text)} className="block h-auto w-full max-w-[280px] outline outline-1 outline-rule-soft" />
          ) : (
            <p role="status" className="flex min-h-[120px] items-center text-center k-cap">
              {failed ? texts.render_failed : texts.rendering}
            </p>
          )}
        </div>

        {canShareFiles && images && (
          <div>
            <Button variant="primary" block iconEnd="share" onClick={shareNative}>
              {texts.native_button}
            </Button>
          </div>
        )}

        <ul className="k-actionlist" aria-label={texts.networks_label}>
          {NETWORKS.map((n) => (
            <li key={n}>
              <a
                className="k-action"
                href={link ? networkUrl(n, link, text) : undefined}
                target={n === "email" ? undefined : "_blank"}
                rel="noopener noreferrer"
                onClick={() => reportShare(card.moment)}
              >
                <span className="k-action__main">{texts.networks[n]}</span>
                <Icon name={n === "email" ? "mail" : "external"} />
              </a>
            </li>
          ))}
          <li>
            <button type="button" className="k-action" onClick={copy}>
              <span className="k-action__main">{texts.copy_button}</span>
              <Icon name="copy" />
            </button>
          </li>
          {images &&
            (["story", "square"] as const).map((f) => (
              <li key={f}>
                <a className="k-action" href={images[f].url} download={fileName(f)} onClick={() => reportShare(card.moment)}>
                  <span className="k-action__main">{f === "story" ? texts.download_story_button : texts.download_square_button}</span>
                  <Icon name="download" />
                </a>
              </li>
            ))}
        </ul>

        <div className="k-field">
          <label htmlFor={linkId} className="k-field__label">
            {texts.link_label}
          </label>
          <input id={linkId} className="k-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </div>
        {status && (
          <p role="status" aria-live="polite" className="font-semibold">
            {status}
          </p>
        )}
      </BottomSheet>
    </>
  );
}
