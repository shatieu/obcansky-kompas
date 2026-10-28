"use client";

import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ButtonLink, IconButton, StickyBar } from "@/components/ui/button";
import { SampleBanner } from "@/components/ui/sample";
import { parseCamera, withCamera, type Camera } from "@/lib/crowd/camera";
import { fixtureSource, httpSource, type CrowdPerson, type CrowdSource } from "@/lib/crowd/data";
import type { CrowdEngine, CrowdStats } from "@/lib/crowd/engine";
import { czPlural, fill, formatCount } from "@/lib/crowd/format";
import { isMobileDevice } from "@/lib/crowd/lod";
import type { CrowdTexts } from "@/lib/crowd/texts";
import { Minimap, type MinimapHandle } from "./minimap";

// Karta (a SVG generátor panáčka) se stáhne až při prvním klepnutí.
const CrowdCard = lazy(() => import("./crowd-card").then((m) => ({ default: m.CrowdCard })));

declare global {
  interface Window {
    /** Měření výkonu (e2e): mimo produkci nebo s ?debug=1. */
    __crowdStats?: CrowdStats;
  }
}

type Status = "loading" | "ready" | "error";

/** Výběr zdroje dat: API; mimo produkci s ?fixture=N nebo když API ještě neexistuje, ukázka. */
async function pickSource(presetIds: string[], fixtureTexts: string[]): Promise<CrowdSource> {
  const dev = process.env.NODE_ENV !== "production";
  const q = new URLSearchParams(window.location.search);
  const fx = Number(q.get("fixture"));
  if (dev && Number.isFinite(fx) && fx > 0) return fixtureSource(Math.min(200_000, Math.floor(fx)), presetIds, fixtureTexts);
  const http = httpSource();
  if (!dev) return http;
  try {
    await http.meta();
    return http;
  } catch {
    return fixtureSource(500, presetIds, fixtureTexts);
  }
}

/**
 * Dav přes celou obrazovku (SPEC-demonstrace §2, §6). PixiJS se načítá dynamicky až tady.
 * `focusId` = stránka /demonstrace/[id]: kamera na panáčkovi a otevřená karta.
 */
export function CrowdView({
  texts,
  presets,
  defaultPreset,
  fixtureTexts,
  focusId = null,
  sample,
  joinHref,
  listHref,
}: {
  texts: CrowdTexts;
  presets: Record<string, string>;
  defaultPreset: string;
  /** Vlastní slogany pro vývojovou ukázku (bez API). */
  fixtureTexts: string[];
  focusId?: string | null;
  /** Pruh „Ukázková data“ (DEMO_MODE / STATIC_DEMO); zobrazí se i podle meta.demo. */
  sample: { show: boolean; title: string; text: string };
  joinHref: string;
  listHref: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CrowdEngine | null>(null);
  const sourceRef = useRef<CrowdSource | null>(null);
  const minimapRef = useRef<MinimapHandle>(null);
  const helpId = useId();
  const [status, setStatus] = useState<Status>("loading");
  const [count, setCount] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [selected, setSelected] = useState<CrowdPerson | null>(null);
  const [me, setMe] = useState<{ id: string; index: number } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [headerH, setHeaderH] = useState(58);

  // Dav vyplní okno pod hlavičkou (na mobilu může mít hlavička dva řádky).
  useEffect(() => {
    const h = document.querySelector<HTMLElement>("header.k-appbar");
    if (!h) return;
    const ro = new ResizeObserver(() => setHeaderH(h.offsetHeight));
    ro.observe(h);
    return () => ro.disconnect();
  }, []);
  const [attempt, setAttempt] = useState(0);

  const presetIds = Object.keys(presets);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: CrowdEngine | null = null;
    let cancelled = false;
    let urlTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingCam: Camera | null = null;
    let mmRaf = 0;
    const debug = process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("debug");

    const writeUrl = () => {
      urlTimer = null;
      if (!pendingCam) return;
      const href = withCamera(window.location.pathname + window.location.search + window.location.hash, pendingCam);
      window.history.replaceState(window.history.state, "", href);
    };

    (async () => {
      setStatus("loading");
      const source = await pickSource(presetIds, fixtureTexts);
      sourceRef.current = source;
      if (cancelled) return;
      let focus: CrowdPerson | null = null;
      if (focusId) {
        focus = await source.person(focusId).catch(() => null);
        if (!focus) setNotFound(true);
      }
      const { CrowdEngine } = await import("@/lib/crowd/engine");
      if (cancelled) return;
      const mobile = isMobileDevice(window.innerWidth, window.matchMedia("(pointer: coarse)").matches);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
      engine = new CrowdEngine({
        host,
        source,
        presets,
        defaultPreset,
        mobile,
        reducedMotion: reduce.matches,
        initialCamera: parseCamera(window.location.search),
        focusIndex: focus?.index ?? null,
        insetBottom: window.innerWidth < 768 ? 64 : 96,
        onSelect: (p) => setSelected(p),
        onMeta: (c, d) => {
          setCount(c);
          setDemo(d);
        },
        onCamera: (c) => {
          pendingCam = c;
          if (!urlTimer) urlTimer = setTimeout(writeUrl, 400);
          if (!mmRaf)
            mmRaf = requestAnimationFrame(() => {
              mmRaf = 0;
              if (engine) minimapRef.current?.draw(engine.minimapState());
            });
        },
        onStats: (s) => {
          if (debug) window.__crowdStats = s;
        },
        onError: () => setStatus("error"),
      });
      engineRef.current = engine;
      const onReduce = () => engine?.setReducedMotion(reduce.matches);
      reduce.addEventListener("change", onReduce);
      try {
        await engine.init();
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) return;
      setStatus((s) => (s === "error" ? s : "ready"));
      minimapRef.current?.draw(engine.minimapState());
      if (focus) {
        engine.addPerson(focus);
        setSelected(focus);
      }
      source
        .me()
        .then((m) => !cancelled && setMe(m))
        .catch(() => undefined);
    })();

    return () => {
      cancelled = true;
      if (urlTimer) clearTimeout(urlTimer);
      cancelAnimationFrame(mmRaf);
      engine?.destroy();
      engineRef.current = null;
      if (debug) delete window.__crowdStats;
    };
    // Engine se staví jednou na stránku (a znovu po „Zkusit znovu“).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, focusId]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const en = engineRef.current;
    if (!en) return;
    const host = hostRef.current!;
    const dx = host.clientWidth * 0.15;
    const dy = host.clientHeight * 0.15;
    const k = e.key;
    if (k === "ArrowLeft") en.panBy(-dx, 0);
    else if (k === "ArrowRight") en.panBy(dx, 0);
    else if (k === "ArrowUp") en.panBy(0, -dy);
    else if (k === "ArrowDown") en.panBy(0, dy);
    else if (k === "+" || k === "=") en.zoomBy(1.25);
    else if (k === "-" || k === "_") en.zoomBy(0.8);
    else if (k === "Home") en.goStart();
    else if (k === "End") en.goEnd();
    else if (k === "Enter" || k === " ") {
      const p = en.centerPerson();
      if (p) setSelected(p);
    } else return;
    e.preventDefault();
  };

  const findMe = async () => {
    const en = engineRef.current;
    if (!en || !me) return;
    en.goTo(me.index, true);
    const p = en.personAt(me.index) ?? (await sourceRef.current?.person(me.id).catch(() => null)) ?? null;
    if (p) {
      en.addPerson(p);
      setSelected(p);
    }
  };

  const onPick = useCallback((x: number, y: number) => {
    const en = engineRef.current;
    if (en) en.setCamera({ ...en.camera, x, y });
  }, []);

  const report = useCallback(async (id: string) => (sourceRef.current ? sourceRef.current.report(id) : false), []);

  const countText = count === null ? "" : fill(czPlural(count, texts.count_one, texts.count_few, texts.count_many), { count: formatCount(count) });
  const toolBtn = "inline-flex min-h-[48px] items-center border-2 border-ink bg-surface px-1 text-caption font-semibold text-ink hover:bg-blue-tint";

  return (
    <section className="relative flex min-h-[480px] flex-col" style={{ height: `calc(100dvh - ${headerH}px)` }} aria-labelledby={`${helpId}-h`}>
      {(sample.show || demo) && (
        <div className="px-2 pt-1 md:hidden">
          <SampleBanner title={sample.title} text={sample.text} />
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface">
        <div
          ref={hostRef}
          className="absolute inset-0 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus"
          role="application"
          tabIndex={0}
          aria-label={texts.canvas_label}
          aria-describedby={`${helpId}-help`}
          onKeyDown={onKey}
        />
        <p id={`${helpId}-help`} className="sr-only">
          {texts.canvas_help} {countText}
        </p>

        <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-136px)] flex-col gap-1 md:max-w-[calc(100%-200px)]">
          <div className="pointer-events-auto self-start border-2 border-ink bg-surface px-1 py-1 md:px-2">
            <h1 id={`${helpId}-h`} className="k-kicker m-0">
              {texts.kicker}
            </h1>
            <p className="k-stat-m m-0" aria-live="polite">
              {countText || " "}
            </p>
          </div>
          {(sample.show || demo) && (
            <div className="pointer-events-auto max-w-[360px] max-md:hidden">
              <SampleBanner title={sample.title} text={sample.text} />
            </div>
          )}
        </div>

        <div className="absolute right-2 top-2">
          <Minimap handle={minimapRef} onPick={onPick} label={texts.minimap_label} />
        </div>

        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col gap-1 bg-surface">
          <IconButton icon="plus" label={texts.zoom_in} onClick={() => engineRef.current?.zoomBy(1.4)} />
          <IconButton icon="minus" label={texts.zoom_out} onClick={() => engineRef.current?.zoomBy(1 / 1.4)} />
        </div>

        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          <button type="button" className={toolBtn} onClick={() => engineRef.current?.goStart()}>
            {texts.start_button}
          </button>
          <button type="button" className={toolBtn} onClick={() => engineRef.current?.goEnd()}>
            {texts.end_button}
          </button>
          {me && (
            <button type="button" className={toolBtn} onClick={findMe}>
              {texts.find_me_button}
            </button>
          )}
        </div>

        {(status !== "ready" || count === 0 || notFound) && (
          <div className="pointer-events-none absolute inset-x-2 top-1/3 flex justify-center">
            <div className="pointer-events-auto border-2 border-ink bg-surface px-2 py-1 text-center" role="status">
              {status === "loading" && <p className="m-0">{texts.loading}</p>}
              {status === "error" && (
                <>
                  <p className="m-0">{texts.error}</p>
                  <button type="button" className="k-btn k-btn--secondary mt-1" onClick={() => setAttempt((a) => a + 1)}>
                    {texts.retry_button}
                  </button>
                </>
              )}
              {status === "ready" && count === 0 && <p className="m-0">{texts.empty}</p>}
              {status === "ready" && notFound && <p className="m-0">{texts.not_found}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="px-2 md:absolute md:bottom-2 md:right-2 md:border-2 md:border-ink md:bg-surface md:py-1">
        <StickyBar>
          <ButtonLink href={joinHref} block iconEnd="arrow-right">
            {texts.join_button}
          </ButtonLink>
          <a className="k-btn k-btn--secondary" href={listHref}>
            {texts.list_button}
          </a>
        </StickyBar>
      </div>

      {selected && (
        <Suspense fallback={null}>
          <CrowdCard
            person={selected}
            texts={texts.card}
            presets={presets}
            defaultPreset={defaultPreset}
            onClose={() => setSelected(null)}
            onReport={report}
          />
        </Suspense>
      )}
    </section>
  );
}
