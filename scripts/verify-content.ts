/**
 * `pnpm verify:content` – brány ověření (SPEC §11.3), v POC režimu jako přehled.
 *
 * Vypíše stav každé vysvětlivky (ověřeno / chybí ověření / zamítnuto / chybí review).
 * Nenulový kód vrací JEN při:
 *   - strukturální chybě (neplatný YAML/JSON, záznam bez povinných polí, nesedící claim_id),
 *   - tvrzení změněném po ověření (claim_hash v posledním záznamu nesedí s textem tvrzení).
 * Neúplně ověřené vysvětlivky build nezastaví – zobrazí se jako „Vysvětlivka se připravuje“
 * (viz DECISIONS.md, Rozhodnutí session). `--strict` zapne plnou bránu ze SPEC §11.3.
 */
import path from "node:path";
import { ContentError, CONTENT_DIR, loadExplainers } from "../lib/content/load";
import { checkExplainer } from "../lib/content/verification";

const strict = process.argv.includes("--strict");

try {
  const explainers = loadExplainers();
  const dir = path.join(CONTENT_DIR, "verification");
  let structural = 0;
  let mismatches = 0;
  let verified = 0;
  for (const { explainer } of explainers) {
    const r = checkExplainer(explainer, dir);
    if (r.verified) verified++;
    const counts = r.claims.reduce<Record<string, number>>((acc, c) => ((acc[c.state] = (acc[c.state] ?? 0) + 1), acc), {});
    const summary = Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(
      `${r.verified ? "OVĚŘENO " : "čeká    "} ${explainer.id.padEnd(10)} tvrzení: ${r.claims.length} ${summary ? `(${summary})` : ""} review: ${r.review}`,
    );
    for (const c of r.claims)
      if (c.state === "hash_mismatch") {
        mismatches++;
        console.error(`  CHYBA ${c.claimId}: ${c.detail}`);
      }
    for (const e of r.structuralErrors) {
      structural++;
      console.error(`  CHYBA ${e}`);
    }
  }
  console.log(`\nvysvětlivek: ${explainers.length}, plně ověřených: ${verified}, neověřené se zobrazí jako „Vysvětlivka se připravuje“.`);
  if (structural || mismatches) {
    console.error(`verify:content selhal: strukturálních chyb ${structural}, tvrzení změněných po ověření ${mismatches}.`);
    process.exit(1);
  }
  if (strict && verified < explainers.length) {
    console.error("verify:content --strict: ne všechny vysvětlivky jsou ověřené.");
    process.exit(1);
  }
} catch (e) {
  if (e instanceof ContentError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
