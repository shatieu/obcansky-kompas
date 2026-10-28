import { cx } from "@/components/ui/format";
import { heroCrowdSvg, HERO_CROWD_VIEWBOX as V } from "./hero-crowd";

/** Spočítá se jednou při importu – ilustrace je konstantní (pevné seedy). */
const CROWD = heroCrowdSvg();

/**
 * Ilustrace online demonstrace v hero hlavní stránky. Statické SVG ze serveru, bez textu a bez JS;
 * celé je odkazem do davu (/demonstrace). Světlá plocha jako dav: čáry --ink, cedule bílé s obrysem --ink a modré (žádná červená – ta patří vlajce).
 */
export function HeroDemo({ label, href = "/demonstrace", className }: { label: string; href?: string; className?: string }) {
  return (
    // Obyčejný <a> bez routeru (jako ButtonLink/Wordmark) – hlavní stránka nenese chunk next/link.
    <a href={href} aria-label={label} className={cx("block", className)} data-hero-demo>
      <svg viewBox={`${V.x} ${V.y} ${V.w} ${V.h}`} className="block h-auto w-full" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: CROWD }} />
    </a>
  );
}
