/**
 * Export a výběr sloganu (čistá logika). Export je vždy 1080 × 1080 a znovu
 * zakódovaný z canvasu, takže nenese žádná metadata původní fotky.
 */
import { FRAME_SIZE, JPEG_QUALITY, NO_SLOGAN, VARIANTS, VARIANTS_WITH_SLOGAN, type Variant } from "./constants";

export const EXPORT_FORMATS = ["png", "jpg"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportPlan {
  width: number;
  height: number;
  mime: "image/png" | "image/jpeg";
  quality: number | undefined;
  /** JPG nemá průhlednost – plátno se nejdřív vyplní. */
  opaque: boolean;
  extension: "png" | "jpg";
}

export function exportPlan(format: ExportFormat): ExportPlan {
  return format === "png"
    ? { width: FRAME_SIZE, height: FRAME_SIZE, mime: "image/png", quality: undefined, opaque: false, extension: "png" }
    : { width: FRAME_SIZE, height: FRAME_SIZE, mime: "image/jpeg", quality: JPEG_QUALITY, opaque: true, extension: "jpg" };
}

/**
 * Velikost plátna náhledu v px: CSS šířka × devicePixelRatio, nejvýš velikost exportu
 * (víc detailu náhled nepotřebuje) a nejméně 1.
 */
export function previewPixels(cssWidth: number, dpr: number): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 3) : 1;
  return Math.max(1, Math.min(FRAME_SIZE, Math.round(cssWidth * d)));
}

export interface Slogan {
  id: string;
  text: string;
}

export function isVariant(v: unknown): v is Variant {
  return typeof v === "string" && (VARIANTS as readonly string[]).includes(v);
}

export function variantHasSlogan(v: Variant): boolean {
  return VARIANTS_WITH_SLOGAN.includes(v);
}

/** Slogan jen ze slogans.yaml: neznámé id → první slogan. */
export function pickSlogan(slogans: readonly Slogan[], id: string | null | undefined): Slogan {
  const first = slogans[0];
  if (!first) throw new Error("slogans.yaml je prázdný");
  return slogans.find((s) => s.id === id) ?? first;
}

/** Název staženého souboru: bez jména člověka, jen varianta a slogan. */
export function exportFileName(variant: Variant, sloganId: string | null, format: ExportFormat): string {
  const parts = ["profilova-fotka", variant];
  if (sloganId && variantHasSlogan(variant)) parts.push(sloganId);
  return `${parts.join("-")}.${exportPlan(format).extension}`;
}

/** Anonymní událost pro /api/event (SPEC §9.3): jen varianta a slogan, nic o fotce. */
export function frameEvent(variant: Variant, sloganId: string): { kind: "frame_downloaded"; variant: Variant; slogan: string } {
  return { kind: "frame_downloaded", variant, slogan: variantHasSlogan(variant) ? sloganId : NO_SLOGAN };
}
