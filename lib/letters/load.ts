import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { parseLettersContent, type LettersContent } from "./schema";

/**
 * Načte a ověří content/letters/*.yaml (jen Node – build, skripty, testy).
 * _common.yaml = společné části, ostatní *.yaml = jeden soubor na typ adresáta.
 */
export function loadLettersContent(dir: string = path.join(process.cwd(), "content", "letters")): LettersContent {
  const read = (file: string): unknown => parse(readFileSync(path.join(dir, file), "utf8"));
  const typeFiles = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && f !== "_common.yaml")
    .sort();
  return parseLettersContent({ common: read("_common.yaml"), types: typeFiles.map(read) });
}
