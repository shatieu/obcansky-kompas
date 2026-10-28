"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { StickmanPreview } from "@/components/demonstrace/stickman/stickman-preview";
import { SelectMark } from "@/components/ui/flag";
import { fill } from "@/lib/crowd/format";
import type { Pose, SignColor } from "@/lib/demo/constants";
import { LOOK_GALLERY } from "@/lib/demo/gallery";

/**
 * Galerie vzhledů v kroku „Vzhled“: všichni panáčci z pevného seznamu (lib/demo/gallery) v aktuální
 * póze a barvě cedule, bez textu, bez animace. Výběr nespotřebuje změny „Jiný panáček“.
 * Přístupnost: radiogroup s roving tabindex (šipky, Home/End), každá volba ≥ 48 px s popiskem
 * „Panáček n z 24“. Náhledy se kreslí až když jsou blízko výřezu (IntersectionObserver).
 */
export function LookGallery({
  seed,
  pose,
  signColor,
  label,
  itemLabel,
  onPick,
}: {
  seed: number;
  pose: Pose;
  signColor: SignColor;
  label: string;
  itemLabel: string;
  onPick: (seed: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const total = LOOK_GALLERY.length;
  const sel = LOOK_GALLERY.indexOf(seed >>> 0);
  const focusIdx = sel >= 0 ? sel : 0;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const cols = Math.max(1, Math.round((listRef.current?.clientWidth ?? 320) / 88));
    const t =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowDown" ? i + cols : e.key === "ArrowUp" ? i - cols : e.key === "Home" ? 0 : e.key === "End" ? total - 1 : null;
    if (t === null) return;
    e.preventDefault();
    const k = Math.min(total - 1, Math.max(0, t));
    onPick(LOOK_GALLERY[k]!);
    listRef.current?.querySelectorAll<HTMLButtonElement>("button")[k]?.focus();
  };

  return (
    <div ref={listRef} role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6">
      {LOOK_GALLERY.map((s, i) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={i === sel}
          aria-label={fill(itemLabel, { n: i + 1, total })}
          tabIndex={i === focusIdx ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onPick(s)}
          className={`relative flex min-h-[108px] items-end justify-center border-2 p-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus ${
            i === sel ? "border-blue bg-blue-tint" : "border-rule-soft bg-surface hover:border-ink"
          }`}
        >
          <LazyFigure seed={s} pose={pose} signColor={signColor} />
          {i === sel && (
            <span className="absolute bottom-0.5 right-0.5 text-ink">
              <SelectMark on />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Náhled až když je tlačítko blízko výřezu – 24 SVG se nekreslí najednou. */
function LazyFigure({ seed, pose, signColor }: { seed: number; pose: Pose; signColor: SignColor }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-[104px] w-full">
      {show && <StickmanPreview className="h-full w-full" seed={seed} pose={pose} signColor={signColor} signText="" animate={false} />}
    </div>
  );
}
