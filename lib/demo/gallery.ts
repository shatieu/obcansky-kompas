import { hash32 } from "@/lib/stickman/prng";

/**
 * Galerie vzhledů (krok „Vzhled“ připojení): pevný seznam seedů, ze kterých si člověk může
 * vybrat přímo. Výběr z galerie NESPOTŘEBUJE změny „Jiný panáček“ (max. 20) – server pozná
 * seed z galerie (isGallerySeed) a počet změn nezvýší. Seznam je deterministický a stejný na
 * serveru i v prohlížeči; změna seznamu nevadí už uloženým panáčkům (seed se jen ukládá).
 */
export const GALLERY_SIZE = 24;
const GALLERY_BASE = 0x6a11e7;

export const LOOK_GALLERY: readonly number[] = Object.freeze(Array.from({ length: GALLERY_SIZE }, (_, i) => hash32(GALLERY_BASE + i)));

const SET = new Set(LOOK_GALLERY);
export const isGallerySeed = (seed: number) => SET.has(seed >>> 0);
