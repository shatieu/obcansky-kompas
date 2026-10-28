"use client";

import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CrowdPerson } from "@/lib/crowd/data";
import { useDemoShare } from "@/components/share/demonstrace-share-context";

// SharePanel + kreslení obrázků až po klepnutí na „Sdílet“ (rozpočet JS /demonstrace/[id], kde je karta otevřená hned).
const DemoShare = lazy(() => import("@/components/share/demonstrace-share"));

/**
 * Háček pro sdílení z karty panáčka (SPEC-demonstrace §8). Tuto komponentu může nahradit
 * agent sdílení – rozhraní: { person, url, label, copiedLabel }. Minimální chování: systémové
 * sdílení (mobil), jinak zkopíruje odkaz na /demonstrace/[id].
 */
export interface CrowdShareProps {
  person: CrowdPerson;
  /** Absolutní odkaz na /demonstrace/[id]. */
  url: string;
  label: string;
  copiedLabel: string;
}

export function CrowdShareButton(props: CrowdShareProps) {
  // Plné sdílení (obrázek Story/čtverec, sítě) – texty dodá stránka přes DemoShareProvider.
  const share = useDemoShare();
  const [want, setWant] = useState(false);
  if (share && want)
    return (
      <Suspense fallback={<Button variant="primary" block icon="share" aria-busy>{props.label}</Button>}>
        <DemoShare person={props.person} url={props.url} label={props.label} defaultOpen />
      </Suspense>
    );
  if (share)
    return (
      <Button variant="primary" block icon="share" onClick={() => setWant(true)} onPointerEnter={() => void import("@/components/share/demonstrace-share")}>
        {props.label}
      </Button>
    );
  return <CopyShareButton {...props} />;
}

function CopyShareButton({ url, label, copiedLabel }: CrowdShareProps) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* zrušené sdílení nebo bez schránky – nic */
    }
  };
  return (
    <div>
      <Button variant="primary" block icon="share" onClick={onClick}>
        {label}
      </Button>
      <p className="k-cap mt-1" role="status">
        {copied ? copiedLabel : ""}
      </p>
    </div>
  );
}
