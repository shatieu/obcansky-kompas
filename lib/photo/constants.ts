/**
 * Konstanty profilové fotky (SPEC §9.3, design system PhotoFrame).
 * Rámečky se kreslí v souřadnicích 1080 × 1080 a pro náhled se jen škálují.
 */

/** Strana exportu i souřadnicového systému rámečků. */
export const FRAME_SIZE = 1080;
/** Poloměr kruhového ořezu (= polovina strany). */
export const FRAME_R = FRAME_SIZE / 2;

export const VARIANTS = ["ring", "ribbon", "corner", "duotone"] as const;
export type Variant = (typeof VARIANTS)[number];

/** Varianty, které nesou slogan. Roh má jen vlajku (vlajka je vždy sama, bez textu). */
export const VARIANTS_WITH_SLOGAN: readonly Variant[] = ["ring", "ribbon", "duotone"];

/** Klíč sloganu v události, když varianta slogan nemá. */
export const NO_SLOGAN = "none";

/** Oficiální barvy vlajky + noční modrá (stejné v obou motivech, exporty jsou statické). */
export const COLORS = {
  navy: "#0B1B33",
  flagBlue: "#11457E",
  flagRed: "#D7141A",
  white: "#FFFFFF",
  tint: "#E8EEF6",
  inkSecondary: "#454E5D",
} as const;

/** Rozsah přiblížení (1 = fotka přesně pokryje čtverec). */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

/** Delší strana zdrojové fotky po načtení (paměť telefonu; 1080 × MAX_ZOOM by bylo zbytečně moc). */
export const MAX_SOURCE_SIDE = 4096;

/** Kvalita JPG exportu. */
export const JPEG_QUALITY = 0.92;
