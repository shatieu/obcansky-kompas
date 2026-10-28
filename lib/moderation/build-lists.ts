/**
 * Generátor dat skriptové moderace z content/moderation/*.txt a ai-prompt.md.
 *
 *   pnpm tsx lib/moderation/build-lists.ts         – přegeneruje *.generated.ts
 *   pnpm tsx lib/moderation/build-lists.ts --check – jen ověří, že jsou aktuální (exit 1)
 *
 * Výstup:
 *  - lists.generated.ts – kmeny v normalizovaném tvaru (izomorfní, jde i do prohlížeče),
 *  - prompt.generated.ts – instrukce pro AI (jen server; za běhu se nic nečte z disku,
 *    takže nic nemusí do outputFileTracingIncludes).
 * Test lists.test.ts hlídá, že vygenerované soubory odpovídají zdrojům.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSimple } from "./normalize";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const MODERATION_DIR = path.join(ROOT, "content", "moderation");
export const LISTS_OUT = path.join(ROOT, "lib", "moderation", "lists.generated.ts");
export const PROMPT_OUT = path.join(ROOT, "lib", "moderation", "prompt.generated.ts");

function readLines(file: string): string[] {
  return readFileSync(path.join(MODERATION_DIR, file), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** Řádek seznamu → normalizovaný záznam („=“/„^“ + kmen bez mezer). */
export function packEntry(line: string): string | null {
  const prefix = line.startsWith("=") || line.startsWith("^") ? line[0] : "";
  const body = normalizeSimple(prefix ? line.slice(1) : line).replace(/ /g, "");
  if (!body) return null;
  if (body.length < 3 && prefix !== "=") throw new Error(`Kmen „${line}“ je po normalizaci kratší než 3 znaky – použij =slovo`);
  return prefix + body;
}

export function packList(lines: string[]): string {
  const set = new Set<string>();
  for (const l of lines) {
    const p = packEntry(l);
    if (p) set.add(p);
  }
  // Delší kmeny dřív (nic na pořadí nezávisí, jen stabilní výstup).
  return [...set].sort((a, b) => a.localeCompare(b)).join("|");
}

export function packNames(lines: string[]): string {
  const set = new Set<string>();
  for (const l of lines) {
    const n = normalizeSimple(l).replace(/ /g, "");
    if (n) set.add(n);
  }
  return [...set].sort().join("|");
}

export function renderLists(): string {
  const block = packList([...readLines("blocklist-cs.txt"), ...readLines("blocklist-en.txt")]);
  const allow = packList(readLines("allowlist-cs.txt"));
  const names = packNames(readLines("public-names.txt"));
  return `// VYGENEROVÁNO lib/moderation/build-lists.ts z content/moderation/*.txt – needitovat ručně.
// Normalizované kmeny (viz normalize.ts); „=“ celé slovo, „^“ začátek slova.
export const BLOCK = ${JSON.stringify(block)};
export const ALLOW = ${JSON.stringify(allow)};
export const PUBLIC_NAMES = ${JSON.stringify(names)};
`;
}

export function renderPrompt(): string {
  const prompt = readFileSync(path.join(MODERATION_DIR, "ai-prompt.md"), "utf8").replace(/\r\n/g, "\n").trim();
  return `// VYGENEROVÁNO lib/moderation/build-lists.ts z content/moderation/ai-prompt.md – needitovat ručně.
export const AI_PROMPT = ${JSON.stringify(prompt)};
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const outputs: [string, string][] = [
    [LISTS_OUT, renderLists()],
    [PROMPT_OUT, renderPrompt()],
  ];
  if (process.argv.includes("--check")) {
    const stale = outputs.filter(([f, c]) => {
      try {
        return readFileSync(f, "utf8") !== c;
      } catch {
        return true;
      }
    });
    if (stale.length) {
      console.error(`moderation: zastaralé ${stale.map(([f]) => path.basename(f)).join(", ")} – spusť pnpm tsx lib/moderation/build-lists.ts`);
      process.exit(1);
    }
    console.log("moderation: seznamy aktuální");
  } else {
    for (const [f, c] of outputs) writeFileSync(f, c, "utf8");
    console.log(`moderation: zapsáno ${outputs.map(([f]) => path.basename(f)).join(", ")}`);
  }
}
