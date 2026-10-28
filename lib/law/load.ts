import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { parseLawContent, type LawContent } from "./schema";

/**
 * Načte a ověří content/law/*.yaml (jen Node – build, skripty, testy).
 * base.yaml = základ, compatibility.yaml = matice, ostatní *.yaml = moduly (v abecedním pořadí).
 */
export function loadLawContent(dir: string = path.join(process.cwd(), "content", "law")): LawContent {
  const read = (file: string): unknown => parse(readFileSync(path.join(dir, file), "utf8"));
  const moduleFiles = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && f !== "base.yaml" && f !== "compatibility.yaml")
    .sort();
  return parseLawContent({
    base: read("base.yaml"),
    compatibility: read("compatibility.yaml"),
    modules: moduleFiles.map(read),
  });
}
