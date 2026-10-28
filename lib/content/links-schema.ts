import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/**
 * content/links.yaml → content/generated/links.json (validuje scripts/content-build.ts, limity textu
 * hlídá scripts/lint-content.ts). Stránka /souvisejici: „K přečtení“ (nestranné zdroje) a
 * „Související iniciativy“ (kontext postoje spolku, SPEC §1 – nikdy z kompasu, vysvětlivek, statistik).
 */
const str = z.string().trim().min(1);
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id: malá písmena, číslice a pomlčky");

export const LINK_TYPES = ["navrh", "zakon", "instituce", "zahranici", "iniciativa"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const linkItemSchema = z.object({
  id,
  title: str,
  description: str.max(120, "popis max. 120 znaků"),
  url: z.url({ protocol: /^https$/ }),
  publisher: str,
  type: z.enum(LINK_TYPES),
  checked_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "checked_at: YYYY-MM-DD"),
  added_by: z.enum(["owner", "research"]).optional(),
});

const group = z.object({ title: str, lead: str, items: z.array(linkItemSchema).min(1) });

export const linksFileSchema = z
  .object({
    meta_title: str,
    kicker: str,
    title: str,
    lead: str,
    external_note: str,
    publisher_label: str,
    method_link: str,
    stance_link: str,
    types: z.object(Object.fromEntries(LINK_TYPES.map((k) => [k, str])) as { [K in LinkType]: typeof str }),
    reading: group,
    initiatives: group.extend({ kicker: str }),
  })
  .superRefine((f, ctx) => {
    const all = [...f.reading.items, ...f.initiatives.items];
    const ids = all.map((i) => i.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: [], message: "duplicitní id odkazu" });
    f.reading.items.forEach((i, n) => {
      if (i.type === "iniciativa")
        ctx.addIssue({ code: "custom", path: ["reading", "items", n, "type"], message: "iniciativy patří jen do initiatives" });
    });
    f.initiatives.items.forEach((i, n) => {
      if (i.type !== "iniciativa")
        ctx.addIssue({ code: "custom", path: ["initiatives", "items", n, "type"], message: "v initiatives jen type: iniciativa" });
      if (!i.added_by)
        ctx.addIssue({ code: "custom", path: ["initiatives", "items", n, "added_by"], message: "iniciativa potřebuje added_by (owner|research)" });
    });
  });

export type LinksFile = z.infer<typeof linksFileSchema>;
export type LinkItem = z.infer<typeof linkItemSchema>;

/** Načtení a validace YAML – jen pro Node skripty (content-build, lint, testy). */
export function loadLinks(dir = path.join(process.cwd(), "content")): LinksFile {
  const file = path.join(dir, "links.yaml");
  const r = linksFileSchema.safeParse(parse(readFileSync(file, "utf8")));
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  ${i.path.join(".") || "(kořen)"}: ${i.message}`).join("\n");
    throw new Error(`content/links.yaml: neplatný obsah\n${issues}`);
  }
  return r.data;
}
