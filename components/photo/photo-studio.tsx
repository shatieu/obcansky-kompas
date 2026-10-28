"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { VARIANTS, type Variant } from "@/lib/photo/constants";
import { clampCrop, initialCrop, keyAction, panBy, pinch, wheelZoom, zoomAt, type Crop, type Point, type Size } from "@/lib/photo/crop";
import { exportFileName, frameEvent, pickSlogan, previewPixels, variantHasSlogan, type ExportFormat, type Slogan } from "@/lib/photo/export";
import type { PhotoUi } from "@/lib/photo/content";
import { Icon, PhotoErrorBox, PhotoOption } from "./parts";

/* Těžší části (dekódování, kreslení) se načtou až v prohlížeči. */
const loadDecode = () => import("@/lib/photo/decode");
const loadRender = () => import("@/lib/photo/render");
type RenderModule = Awaited<ReturnType<typeof loadRender>>;
type FrameFont = Awaited<ReturnType<RenderModule["resolveFrameFont"]>>;

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

type Status =
  | { kind: "idle" }
  | { kind: "loading"; heic: boolean }
  | { kind: "error"; message: string }
  | { kind: "downloaded" };

interface Photo {
  source: HTMLCanvasElement;
  size: Size;
}

/** Dotykové zařízení (tlačítko „Vyfotit se“ má smysl jen tam). */
const COARSE = "(pointer: coarse)";
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getCoarse = () => window.matchMedia(COARSE).matches;

const FALLBACK_FONT: FrameFont = { family: "sans-serif", stretch: "normal" };

export function PhotoStudio({ ui, slogans }: { ui: PhotoUi; slogans: Slogan[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const cropRef = useRef<Crop | null>(null);
  const [variant, setVariant] = useState<Variant>("ring");
  const [sloganId, setSloganId] = useState<string>(slogans[0]?.id ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [font, setFont] = useState<FrameFont>(FALLBACK_FONT);
  const [renderMod, setRenderMod] = useState<RenderModule | null>(null);
  const [px, setPx] = useState(0);
  const coarse = useSyncExternalStore(subscribeCoarse, getCoarse, () => false);

  const slogan = pickSlogan(slogans, sloganId);

  const updateCrop = useCallback((next: Crop | null) => {
    cropRef.current = next;
    setCrop(next);
  }, []);

  // Kreslicí modul a písmo.
  useEffect(() => {
    let alive = true;
    loadRender().then(async (m) => {
      if (!alive) return;
      setRenderMod(m);
      const f = await m.resolveFrameFont();
      if (alive) setFont(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Velikost plátna náhledu podle šířky na obrazovce × DPR.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setPx(previewPixels(el.getBoundingClientRect().width, window.devicePixelRatio));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Náhled = stejné kreslení jako export, jen menší plátno.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !renderMod || !px) return;
    const id = requestAnimationFrame(() => {
      if (el.width !== px) el.width = px;
      if (el.height !== px) el.height = px;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      renderMod.renderFrame(ctx, px, {
        photo: photo && crop ? { source: photo.source, size: photo.size, crop } : null,
        variant,
        slogan: slogan.text,
        font,
        placeholder: ui.placeholder,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [renderMod, px, photo, crop, variant, slogan.text, font, ui.placeholder]);

  const openFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setStatus({ kind: "loading", heic: false });
      try {
        const { loadPhoto } = await loadDecode();
        const loaded = await loadPhoto(file, () => setStatus({ kind: "loading", heic: true }));
        setPhoto({ source: loaded.canvas, size: loaded.size });
        updateCrop(initialCrop(loaded.size));
        setStatus({ kind: "idle" });
      } catch (e) {
        const code = (e as { code?: string }).code;
        setStatus({
          kind: "error",
          message: code === "type" ? ui.error_type : code === "heic" ? ui.error_heic : ui.error_decode,
        });
      }
    },
    [ui, updateCrop],
  );

  /* ---------------- gesta: posun, pinch, kolečko, klávesnice ---------------- */

  const pointers = useRef(new Map<number, Point>());
  const toFrame = (e: { clientX: number; clientY: number }): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!photo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, toFrame(e));
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    const c = cropRef.current;
    if (!prev || !photo || !c) return;
    const now = toFrame(e);
    if (map.size === 1) {
      map.set(e.pointerId, now);
      updateCrop(panBy(c, now.x - prev.x, now.y - prev.y, photo.size));
      return;
    }
    const others = [...map.entries()].filter(([id]) => id !== e.pointerId);
    const other = others[0]?.[1];
    if (!other) return;
    const before = pinch(prev, other);
    const after = pinch(now, other);
    map.set(e.pointerId, now);
    if (before.dist < 1e-6) return;
    let next = zoomAt(c, c.zoom * (after.dist / before.dist), after.mid, photo.size);
    next = panBy(next, after.mid.x - before.mid.x, after.mid.y - before.mid.y, photo.size);
    updateCrop(next);
  };

  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
  };

  // Kolečko: posluchač musí být „non-passive“, aby šlo zabránit posunu stránky.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !photo) return;
    const onWheel = (e: WheelEvent) => {
      const c = cropRef.current;
      if (!c) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const anchor = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      updateCrop(zoomAt(c, wheelZoom(c.zoom, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY), anchor, photo.size));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [photo, updateCrop]);

  const zoomBy = (factor: number) => {
    const c = cropRef.current;
    if (!photo || !c) return;
    updateCrop(zoomAt(c, c.zoom * factor, { x: 0.5, y: 0.5 }, photo.size));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const c = cropRef.current;
    if (!photo || !c) return;
    const a = keyAction(e.key, e.shiftKey);
    if (!a) return;
    e.preventDefault();
    if ("pan" in a) updateCrop(panBy(c, a.pan.x, a.pan.y, photo.size));
    else if ("zoom" in a) zoomBy(a.zoom);
    else updateCrop(initialCrop(photo.size));
  };

  /* ---------------- přetažení souboru ---------------- */

  const onDragOver = (e: DragEvent) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void openFile(e.dataTransfer.files[0]);
  };

  /* ---------------- export ---------------- */

  const download = async (format: ExportFormat) => {
    if (!photo || !crop || busy) return;
    setBusy(true);
    try {
      const m = renderMod ?? (await loadRender());
      const blob = await m.exportFrame(
        { photo: { source: photo.source, size: photo.size, crop: clampCrop(crop, photo.size) }, variant, slogan: slogan.text, font, placeholder: ui.placeholder },
        format,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(variant, slogan.id, format);
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus({ kind: "downloaded" });
      // Jen anonymní počítadlo (varianta, slogan). Fotka nikam neodchází.
      void fetch("/api/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(frameEvent(variant, slogan.id)),
        keepalive: true,
      }).catch(() => {});
    } catch {
      setStatus({ kind: "error", message: ui.error_export });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPhoto(null);
    updateCrop(null);
    setStatus({ kind: "idle" });
    if (pickRef.current) pickRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const loading = status.kind === "loading";
  const zoomPct = crop ? Math.round(crop.zoom * 100) : 100;
  const btnSquare =
    "inline-flex size-[48px] items-center justify-center border-2 border-ink bg-surface text-ink transition-colors duration-100 hover:bg-blue-tint disabled:hatch disabled:border-muted disabled:text-muted";
  const btnText =
    "inline-flex min-h-[48px] items-center gap-[8px] px-[4px] text-[17px] font-semibold text-blue underline underline-offset-4";
  const btnPrimary =
    "inline-flex min-h-[60px] w-full flex-1 items-center justify-center gap-[8px] border-2 border-blue bg-blue px-[24px] font-wide text-[17px] font-bold text-on-blue transition-colors duration-100 hover:bg-blue-hover disabled:hatch disabled:border-muted disabled:bg-surface disabled:text-muted md:w-auto md:flex-none";

  return (
    <div className="flex flex-col gap-[24px]">
      {/* Náhled + ořez. Kruhový náhled je jediné zaoblení na stránce (spolu s výběrovou značkou). */}
      <div
        className="flex flex-col items-center gap-[16px]"
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className={`relative w-full max-w-[420px] ${dragging ? "outline outline-[3px] outline-offset-[6px] outline-blue" : ""}`}>
          <canvas
            ref={canvasRef}
            className={`block aspect-square w-full touch-none select-none ${photo ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
            style={{ borderRadius: "50%" }}
            role={photo ? "application" : "img"}
            aria-label={fill(ui.preview_label, { frame: ui.frames[variant] })}
            aria-describedby={photo ? "fotka-klavesy" : undefined}
            tabIndex={photo ? 0 : -1}
            onClick={() => !photo && !loading && pickRef.current?.click()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onKeyDown}
          />
          {dragging && (
            <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink py-[8px] text-center text-[17px] font-semibold text-surface">
              {ui.drop_active}
            </p>
          )}
        </div>

        {photo ? (
          <div className="flex w-full max-w-[420px] flex-col gap-[8px]">
            <div className="flex items-center justify-between gap-[8px]">
              <button type="button" className={btnSquare} onClick={() => zoomBy(1 / 1.2)} disabled={!crop || crop.zoom <= 1} aria-label={ui.zoom_out_button}>
                <Icon name="minus" />
              </button>
              <output className="tabular text-[15px] font-semibold" aria-live="polite">
                {fill(ui.zoom_value, { n: zoomPct })}
              </output>
              <button type="button" className={btnSquare} onClick={() => zoomBy(1.2)} disabled={!crop || crop.zoom >= 5} aria-label={ui.zoom_in_button}>
                <Icon name="plus" />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-[16px]">
              <button type="button" className={btnText} onClick={() => updateCrop(initialCrop(photo.size))}>
                <Icon name="refresh" className="size-5" />
                {ui.reset_button}
              </button>
              <button type="button" className={btnText} onClick={reset}>
                {ui.change_button}
              </button>
            </div>
            <p className="text-[14px] leading-[20px] text-ink-secondary">{ui.crop_hint}</p>
            <p id="fotka-klavesy" className="sr-only">
              {ui.keyboard_hint}
            </p>
          </div>
        ) : (
          <p className="hidden text-[15px] text-ink-secondary md:block">{ui.drop_hint}</p>
        )}

        <input
          ref={pickRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void openFile(e.currentTarget.files?.[0])}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void openFile(e.currentTarget.files?.[0])}
        />
      </div>

      <div aria-live="polite" className="empty:hidden">
        {loading && <p className="text-[17px] font-semibold">{status.heic ? ui.heic_loading : ui.loading}</p>}
        {status.kind === "error" && <PhotoErrorBox>{status.message}</PhotoErrorBox>}
        {status.kind === "downloaded" && <p className="border-l-4 border-blue pl-[12px] text-[17px] font-semibold">{ui.downloaded}</p>}
      </div>

      <fieldset className="flex flex-col gap-[8px]">
        <legend className="mb-[8px] font-wide text-[13px] font-bold uppercase tracking-[0.08em]">{ui.frame_title}</legend>
        <div className="grid gap-[8px] sm:grid-cols-2">
          {VARIANTS.map((v) => (
            <PhotoOption key={v} name="ramecek" value={v} checked={variant === v} onChange={(x) => setVariant(x as Variant)}>
              {ui.frames[v]}
            </PhotoOption>
          ))}
        </div>
      </fieldset>

      {variantHasSlogan(variant) && (
        <fieldset className="flex flex-col gap-[8px]">
          <legend className="mb-[8px] font-wide text-[13px] font-bold uppercase tracking-[0.08em]">{ui.slogan_title}</legend>
          {slogans.map((s) => (
            <PhotoOption key={s.id} name="slogan" value={s.id} checked={slogan.id === s.id} onChange={setSloganId}>
              {s.text}
            </PhotoOption>
          ))}
        </fieldset>
      )}

      <div className="flex flex-col gap-[8px]">
        <p className="text-[15px] leading-[22px]">{ui.facebook_note}</p>
        <details className="border-t-2 border-ink">
          <summary className="flex min-h-[48px] cursor-pointer items-center font-semibold">{ui.howto_title}</summary>
          <ol className="list-decimal bg-blue-tint py-[16px] pl-[40px] pr-[16px] text-[17px] leading-[26px]">
            {ui.howto_steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
      </div>

      {/* Primární akce: na mobilu přilepená dole přes celou šířku. */}
      <div className="sticky bottom-0 z-30 -mx-[16px] border-t-2 border-ink bg-surface px-[16px] py-[12px] md:static md:mx-0 md:border-t-0 md:px-0">
        {photo ? (
          <div className="flex flex-col items-stretch gap-[4px] md:flex-row md:items-center md:gap-[24px]">
            <button type="button" className={btnPrimary} onClick={() => void download("png")} disabled={busy}>
              <Icon name="download" />
              {ui.download_png_button}
            </button>
            <button type="button" className={`${btnText} justify-center`} onClick={() => void download("jpg")} disabled={busy}>
              {ui.download_jpg_button}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-stretch gap-[4px] md:flex-row md:items-center md:gap-[24px]">
            <button type="button" className={btnPrimary} onClick={() => pickRef.current?.click()} disabled={loading}>
              {ui.pick_button}
              <Icon name="arrow-right" />
            </button>
            {coarse && (
              <button type="button" className={`${btnText} justify-center`} onClick={() => cameraRef.current?.click()} disabled={loading}>
                {ui.camera_button}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
