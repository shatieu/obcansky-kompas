"use client";

import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ButtonLink, IconButton } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/disclosure";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { parseCamera, withCamera, type Camera } from "@/lib/crowd/camera";
import { fixtureSource, httpSource, type CrowdPerson, type CrowdSource } from "@/lib/crowd/data";
import type { CrowdEngine, CrowdStats } from "@/lib/crowd/engine";
import { czPlural, fill, formatCount } from "@/lib/crowd/format";
import { isMobileDevice } from "@/lib/crowd/lod";
import { hasInCrowdHint, serverInCrowd, subscribeInCrowd } from "@/lib/demo/in-crowd";
import type { CrowdTexts } from "@/lib/crowd/texts";
import { Minimap, type MinimapHandle } from "./minimap";

/** Šířka ≥ 768 px (desktop rozvržení lišty a minimapy). Server: mobil. */
const WIDE_QUERY = "(min-width: 768px)";
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const getWide = () => window.matchMedia(WIDE_QUERY).matches;
const getWideServer = () => false;

// Karta (a SVG generátor panáčka) se stáhne až při prvním klepnutí.
const CrowdCard = lazy(() => import("./crowd-card").then((m) => ({ default: m.CrowdCard })));

declare global {
  interface Window {
    /** Měření výkonu (e2e): mimo produkci nebo s ?debug=1. */
    __crowdStats?: CrowdStats;
    /** Ladění/e2e (stejně jako __crowdStats): zásahové plochy a viditelné postavy. */
    __crowdDebug?: Pick<CrowdEngine, "debugFigure" | "debugVisible" | "camera">;
  }
}

type Status = "loading" | "ready" | "error";
type CardPerson = CrowdPerson & { id: string };

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
  const [selected, setSelected] = useState<CardPerson | null>(null);
  const [me, setMe] = useState<{ id: string; index: number } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [headerH, setHeaderH] = useState(58);
  /** Už v davu (nápověda ok_in_crowd hned po hydrataci, potvrdí /me) → „Upravit panáčka“. */
  const hint = useSyncExternalStore(subscribeInCrowd, hasInCrowdHint, serverInCrowd);
  const [meKnown, setMeKnown] = useState<boolean | null>(null);
  const inCrowd = meKnown ?? hint;
  /** Minimapa a skoky v davu na mobilu jen na požádání (panel pod lištou). */
  const [mapOpen, setMapOpen] = useState(false);
  /** Nabídka „Další možnosti“ (mobil): skoky v davu a seznam. */
  const [moreOpen, setMoreOpen] = useState(false);
  const wide = useSyncExternalStore(subscribeWide, getWide, getWideServer);
  const minimapShown = wide || mapOpen;

  // Minimapa se po (znovu)připojení plátna překreslí.
  useEffect(() => {
    if (!minimapShown) return;
    const en = engineRef.current;
    if (en) minimapRef.current?.draw(en.minimapState());
  }, [minimapShown, status]);

  // Dav vyplní okno pod hlavičkou (na mobilu může mít hlavička dva řádky).
  useEffect(() => {
    const h = document.querySelector<HTMLElement>("header.k-appbar");
    if (!h) return;
    const ro = new ResizeObserver(() => setHeaderH(h.offsetHeight));
    ro.observe(h);
    return () => ro.disconnect();
  }, []);
  const [attempt, setAttempt] = useState(0);

  /** Výběr postavy: s id hned, jinak GET /api/demonstrace/at/[index] (z CDN), pak karta. */
  const select = useCallback(async (index: number, p?: CrowdPerson) => {
    const q = p?.id ? p : ((await sourceRef.current?.personAt(index).catch(() => null)) ?? null);
    if (!q?.id) return;
    engineRef.current?.addPerson(q);
    setSelected({ ...q, id: q.id });
  }, []);

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
        // Ovládání je mimo plátno (lišta nad ním, akce pod ním) – dole nic nezakrývá pódium.
        insetBottom: 0,
        // Při otevřené kartě: list karty dole (přes okno, max. 85dvh, typicky ~half); nahoře nic.
        focusInsets: () => {
          const r = host.getBoundingClientRect();
          const sheet = Math.min(window.innerHeight * 0.55, 400);
          return { top: 8, bottom: Math.max(0, sheet - (window.innerHeight - r.bottom)) };
        },
        // Dlaždice nenesou id – karta (sdílení, nahlášení) ho dotáhne podle indexu.
        onSelect: (p) => void select(p.index, p),
        onSelectIndex: (i) => void select(i),
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
      if (debug) window.__crowdDebug = engine;
      setStatus((s) => (s === "error" ? s : "ready"));
      minimapRef.current?.draw(engine.minimapState());
      if (focus?.id) {
        engine.addPerson(focus);
        setSelected({ ...focus, id: focus.id });
      }
      source
        .me()
        .then((m) => {
          if (cancelled) return;
          setMe(m);
          // /me zároveň nastaví nebo smaže cookie ok_in_crowd (lib/demo/in-crowd).
          setMeKnown(!!m);
        })
        .catch(() => undefined);
    })();

    return () => {
      cancelled = true;
      if (urlTimer) clearTimeout(urlTimer);
      cancelAnimationFrame(mmRaf);
      engine?.destroy();
      engineRef.current = null;
      if (debug) {
        delete window.__crowdStats;
        delete window.__crowdDebug;
      }
    };
    // Engine se staví jednou na stránku (a znovu po „Zkusit znovu“).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, focusId]);

  // Zvýraznění vybrané postavy (popředí + průhledné překrývající postavy) jen s otevřenou kartou:
  // klepnutí, „Najdi mě“, /demonstrace/[id]. Zavřením karty se zruší.
  useEffect(() => {
    engineRef.current?.setFocus(selected?.index ?? null);
  }, [selected, status]);

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
      if (p) void select(p.index, p);
    } else return;
    e.preventDefault();
  };

  const findMe = async () => {
    const en = engineRef.current;
    if (!en || !me) return;
    en.goTo(me.index, true);
    const known = en.personAt(me.index);
    const p = known?.id ? known : ((await sourceRef.current?.person(me.id).catch(() => null)) ?? null);
    if (p?.id) {
      en.addPerson(p);
      setSelected({ ...p, id: p.id });
    }
  };

  const onPick = useCallback((x: number, y: number) => {
    const en = engineRef.current;
    if (en) en.setCamera({ ...en.camera, x, y });
  }, []);

  const report = useCallback(async (id: string, token: string) => (sourceRef.current ? sourceRef.current.report(id, token) : false), []);

  const countText = count === null ? "" : fill(czPlural(count, texts.count_one, texts.count_few, texts.count_many), { count: formatCount(count) });
  const sampleShown = sample.show || demo;
  const joinLink = inCrowd ? `${joinHref}?edit=1` : joinHref;
  const joinLabel = inCrowd ? texts.edit_button : texts.join_button;
  const toolBtn = "inline-flex min-h-[48px] items-center border-2 border-ink bg-surface px-1 text-caption font-semibold text-ink hover:bg-blue-tint";
  const minimap = <Minimap handle={minimapRef} onPick={onPick} label={texts.minimap_label} />;
  /** Skoky v davu: desktop v liště, mobil v nabídce „Další možnosti“ (po volbě se zavře). */
  const goStart = () => {
    setMoreOpen(false);
    engineRef.current?.goStart();
  };
  const goEnd = () => {
    setMoreOpen(false);
    engineRef.current?.goEnd();
  };
  const goMe = () => {
    setMoreOpen(false);
    void findMe();
  };
  const navButtons = (cls: string) => (
    <>
      <button type="button" className={cls} onClick={goStart}>
        {texts.start_button}
      </button>
      <button type="button" className={cls} onClick={goEnd}>
        {texts.end_button}
      </button>
      {me && (
        <button type="button" className={cls} onClick={goMe}>
          {texts.find_me_button}
        </button>
      )}
    </>
  );

  return (
    <section className="relative flex min-h-[420px] flex-col" style={{ height: `calc(100dvh - ${headerH}px)` }} aria-labelledby={`${helpId}-h`}>
      {/*
        Jedna úzká lišta (48 px) nad davem – přes plátno nic neplave (vlastník: „méně místa pro HUD“).
        Mobil: domů, počet (malý text), mapa, −, +, „⋯“ (skoky v davu, seznam). Desktop: i skoky,
        seznam a primární akce přímo v liště. Ukázková data: na mobilu odznak „Ukázkový režim“ v hlavičce.
      */}
      <div className="flex h-[50px] flex-none items-center gap-0.5 border-b-2 border-ink bg-surface px-0.5 md:h-[60px] md:gap-1 md:px-2">
        <Link href="/" prefetch={false} aria-label={texts.home_aria} title={texts.home_aria} className="k-iconbtn border-0">
          <Icon name="chevron-left" />
        </Link>
        <div className="min-w-0 flex-1 md:flex-none md:pr-2">
          <h1 id={`${helpId}-h`} className="sr-only">
            {texts.kicker}
          </h1>
          <p className="m-0 line-clamp-2 text-[13px] font-semibold leading-[16px] md:text-body md:leading-6" aria-live="polite">
            {countText || " "}
          </p>
        </div>
        {wide && <div className="flex gap-1">{navButtons(toolBtn)}</div>}
        {wide && sampleShown && (
          <span className="k-badge ml-auto" title={sample.text}>
            {sample.title}
          </span>
        )}
        <div className={wide && sampleShown ? "flex flex-none items-center gap-0.5 md:gap-1" : "ml-auto flex flex-none items-center gap-0.5 md:gap-1"}>
          {!wide && (
            <IconButton
              icon="map"
              label={texts.minimap_button}
              title={texts.minimap_button}
              className="border-0 aria-expanded:bg-blue-tint"
              aria-expanded={mapOpen}
              aria-controls={`${helpId}-map`}
              onClick={() => setMapOpen((o) => !o)}
            />
          )}
          <IconButton icon="minus" label={texts.zoom_out} title={texts.zoom_out} className="max-md:border-0" onClick={() => engineRef.current?.zoomBy(1 / 1.4)} />
          <IconButton icon="plus" label={texts.zoom_in} title={texts.zoom_in} className="max-md:border-0" onClick={() => engineRef.current?.zoomBy(1.4)} />
          {!wide && (
            <IconButton icon="more" label={texts.more_button} title={texts.more_button} className="border-0" aria-haspopup="dialog" onClick={() => setMoreOpen(true)} />
          )}
          {wide && (
            <>
              <a className="k-btn k-btn--secondary" href={listHref}>
                {texts.list_button}
              </a>
              <ButtonLink href={joinLink} iconEnd="arrow-right" className="min-h-[48px]">
                {joinLabel}
              </ButtonLink>
            </>
          )}
        </div>
      </div>

      {/* Mobil: mapa na požádání v panelu pod lištou (plátno se zmenší, nic ho nezakryje). */}
      {!wide && mapOpen && (
        <div id={`${helpId}-map`} className="flex flex-none justify-center border-b-2 border-ink bg-surface p-0.5">
          {minimap}
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
          {sampleShown ? ` ${sample.title}: ${sample.text}` : ""}
        </p>

        {/* Desktop: minimapa v rohu plátna, mimo střed. */}
        {wide && <div className="absolute right-2 top-2">{minimap}</div>}

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

      {/* Mobil: jediná primární akce jako úzká lišta (48 px přes celou šířku); seznam je v „⋯“. */}
      {!wide && (
        <div className="flex-none bg-blue pb-[env(safe-area-inset-bottom)]">
          {/* Kdo už v davu stojí, dostane úpravu místo připojení (stejné místo, bez posunu). */}
          <ButtonLink href={joinLink} block iconEnd="arrow-right" className="min-h-[48px]">
            {joinLabel}
          </ButtonLink>
        </div>
      )}

      {moreOpen && (
        <BottomSheet title={texts.more_button} onClose={() => setMoreOpen(false)} closeLabel={texts.card.close}>
          <div className="flex flex-col items-stretch gap-1">
            {navButtons("k-btn k-btn--secondary justify-start border-ink")}
            <a className="k-btn k-btn--secondary justify-start border-ink" href={listHref}>
              {texts.list_button}
            </a>
          </div>
        </BottomSheet>
      )}

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
