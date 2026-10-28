/**
 * Validuje celý content/ (zod) a zapíše JSON pro aplikaci do content/generated/.
 * Spouští se před dev, build, typecheck i test – neplatný obsah build zastaví.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ContentError, CONTENT_DIR, loadContent } from "../lib/content/load";
import { crossCheck } from "../lib/content/cross-check";
import { checkExplainer } from "../lib/content/verification";
import { UI_SERVER_SECTIONS } from "../lib/content/schemas";

const OUT = path.join(CONTENT_DIR, "generated");

function write(name: string, data: unknown) {
  writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 1) + "\n", "utf8");
}

try {
  const c = loadContent();
  const errors = crossCheck(c);
  if (errors.length) throw new ContentError(errors.join("\n"));

  mkdirSync(OUT, { recursive: true });
  const verificationDir = path.join(CONTENT_DIR, "verification");
  // Zobrazí se jen plně ověřené vysvětlivky (SPEC §11.3); ostatní = „Vysvětlivka se připravuje“.
  const explainers: Record<string, unknown> = {};
  let verifiedCount = 0;
  for (const { explainer: e } of c.explainers) {
    const check = checkExplainer(e, verificationDir);
    if (!check.verified) {
      explainers[e.id] = { status: "pending" };
      continue;
    }
    verifiedCount++;
    explainers[e.id] = {
      status: "verified",
      humanReviewed: e.human_reviewed === true,
      text: e.text,
      pro: e.pro ?? null,
      proti: e.proti ?? null,
      sources: e.claims.map((cl) => ({ id: cl.id, title: cl.source_title, url: cl.source_url, locator: cl.locator })),
    };
  }

  write("questions.json", c.questions);
  write("sentences.json", c.sentences);
  write("facts.json", c.facts);
  // Pro aplikaci (i klientský bundle) jen id + hodnota; plná tvrzení zůstávají ve facts.json.
  write("fact-values.json", c.facts.map((f) => ({ id: f.id, value: f.value })));
  // Klientský bundle dostane jen sekce pro prohlížeč; serverové sekce (podpis, e-maily, /fotka,
  // /akce, zákon) čtou loadery přímo z content/ui.yaml.
  const server = new Set<string>(UI_SERVER_SECTIONS);
  write("ui.json", Object.fromEntries(Object.entries(c.ui).filter(([k]) => !server.has(k))));
  write("stance.json", c.stance);
  write("share.json", c.share);
  write("slogans.json", c.slogans);
  write("explainers.json", explainers);
  console.log(
    `content: OK (verze ${c.sentences.version}, vysvětlivek ${c.explainers.length}, ověřených ${verifiedCount})`,
  );
} catch (e) {
  if (e instanceof ContentError) {
    console.error(`content: CHYBA\n${e.message}`);
    process.exit(1);
  }
  throw e;
}
