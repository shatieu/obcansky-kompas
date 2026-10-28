/**
 * Barvy a rozměry sdílecích obrázků (design systém: ShareImage, tokens.json). Obrázky mají
 * v obou motivech stejnou noční plochu; vlajka v oficiálních barvách.
 */
export const COLORS = {
  night: "#0B1B33",
  onNight: "#FFFFFF",
  /** Modrá pro tmavé plochy (kicker na noční ploše). */
  nightAccent: "#82B6F0",
  inkSecondary: "#454E5D",
  flagBlue: "#11457E",
  flagRed: "#D7141A",
  flagWhite: "#FFFFFF",
} as const;

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const FORMATS = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
} as const;

export type ShareFormat = keyof typeof FORMATS;
