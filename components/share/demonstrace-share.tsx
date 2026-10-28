"use client";

import { useEffect, useMemo, useState } from "react";
import { SharePanel } from "@/components/share/share-panel";
import { useDemoShare, type DemoShareConfig } from "@/components/share/demonstrace-share-context";
import { tileOf, type TileResponse } from "@/lib/demo/constants";
import { sloganText, type CrowdPerson } from "@/lib/crowd/data";
import type { CrowdFigure } from "@/lib/share/card";
import { demonstraceCard, neighborsFromTile } from "@/lib/share/demonstrace";

/**
 * Sdílení panáčka z davu (SPEC-demonstrace §8). Texty (ui.yaml `share`, jen server) dodá stránka
 * přes DemoShareProvider (demonstrace-share-context); karta panáčka tuto komponentu načte líně.
 * Story a čtverec kreslí SharePanel v prohlížeči (canvas), OG obrázek /api/og/demonstrace?id=.
 */
/** Počet účastníků a sousedé z dlaždice (obojí z CDN cache); bez sítě obrázek vznikne i tak. */
function useCrowdContext(index: number) {
  const [count, setCount] = useState<number | null>(null);
  const [crowd, setCrowd] = useState<CrowdFigure[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let off = false;
    const meta = fetch("/api/demonstrace/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { count?: number } | null) => {
        if (!off && typeof m?.count === "number") setCount(m.count);
      })
      .catch(() => {});
    const tile = fetch(`/api/demonstrace/tile/${tileOf(index)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t: TileResponse | null) => {
        if (!off && t?.items) setCrowd(neighborsFromTile(t.items, index));
      })
      .catch(() => {});
    // Obrázek se kreslí při otevření panelu – počkej na data, nejdéle 1,5 s.
    const timer = window.setTimeout(() => !off && setReady(true), 1500);
    void Promise.allSettled([meta, tile]).then(() => !off && setReady(true));
    return () => {
      off = true;
      window.clearTimeout(timer);
    };
  }, [index]);
  return { count, crowd, ready };
}

export default function DemoShare({
  person,
  url,
  label,
  config: configProp,
  sticky = false,
}: {
  person: Pick<CrowdPerson, "id" | "index" | "seed" | "pose" | "signColor" | "slogan" | "name">;
  url: string;
  label?: string;
  config?: DemoShareConfig;
  sticky?: boolean;
}) {
  const ctx = useDemoShare();
  const config = configProp ?? ctx;
  const { count, crowd, ready } = useCrowdContext(person.index);
  const card = useMemo(() => {
    if (!config) return null;
    const signText = sloganText(person.slogan, config.presets, config.defaultPreset);
    return demonstraceCard(
      { seed: person.seed, pose: person.pose, signColor: person.signColor, signText, name: person.name, crowd },
      count,
      config.image,
    );
  }, [config, person, count, crowd]);
  if (!config || !card) return null;
  // Panel se po načtení dat jednou přimontuje znovu (key), aby obrázek měl počet a sousedy.
  return <SharePanel key={ready ? "ready" : "early"} card={card} url={url} texts={config.texts} buttonLabel={label} sticky={sticky} />;
}
