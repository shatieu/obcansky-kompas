/**
 * Odkazy a čtení (/souvisejici) pro aplikaci – content/generated/links.json, které zapisuje a
 * validuje `scripts/content-build.ts` (schéma lib/content/links-schema.ts). Jen serverové komponenty.
 */
import linksJson from "@/content/generated/links.json";
import type { LinksFile } from "./links-schema";

export const links = linksJson as unknown as LinksFile;

export const LINKS_HREF = "/souvisejici";
export const READING_ANCHOR = "k-precteni";
export const INITIATIVES_ANCHOR = "iniciativy";
