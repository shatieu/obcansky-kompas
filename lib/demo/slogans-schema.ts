import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { SLOGAN_MAX } from "./constants";

/**
 * Předvolby sloganů davu (content/demonstrace/slogans.yaml → content/generated/demonstrace-slogans.json,
 * validuje scripts/content-build.ts). Schéma je tady, aby ho sdílel build, lint i testy.
 */
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id: malá písmena, číslice a pomlčky");
const sloganText = z.string().trim().min(3).max(SLOGAN_MAX, `max. ${SLOGAN_MAX} znaků`);

/** Tři slogany z content/slogans.yaml (profilové fotky) musí být i mezi předvolbami davu. */
export const REQUIRED_PRESET_IDS = ["ruce-pryc", "media-nedame", "nejsou-jedno"] as const;

export const demoSlogansSchema = z
  .object({
    default: id,
    presets: z.array(z.object({ id, text: sloganText })).min(8).max(12),
    custom_seed_examples: z.array(sloganText).min(10),
  })
  .superRefine((f, ctx) => {
    const ids = f.presets.map((p) => p.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["presets"], message: "duplicitní id" });
    if (!ids.includes(f.default)) ctx.addIssue({ code: "custom", path: ["default"], message: `výchozí předvolba ${f.default} neexistuje` });
    for (const r of REQUIRED_PRESET_IDS)
      if (!ids.includes(r)) ctx.addIssue({ code: "custom", path: ["presets"], message: `chybí předvolba ${r} (content/slogans.yaml)` });
  });

export type DemoSlogansFile = z.infer<typeof demoSlogansSchema>;

/** Načtení a validace YAML – jen pro Node skripty (content-build, lint, seed). */
export function loadDemoSlogans(dir = path.join(process.cwd(), "content")): DemoSlogansFile {
  const file = path.join(dir, "demonstrace", "slogans.yaml");
  const r = demoSlogansSchema.safeParse(parse(readFileSync(file, "utf8")));
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  ${i.path.join(".") || "(kořen)"}: ${i.message}`).join("\n");
    throw new Error(`content/demonstrace/slogans.yaml: neplatný obsah\n${issues}`);
  }
  return r.data;
}
