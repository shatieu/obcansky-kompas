/**
 * `pnpm demo:reported` – výpis nahlášených a skrytých panáčků (SPEC-demonstrace §4.3).
 * Ukazuje i neschválené texty – jen pro moderátora v terminálu, nikam se neposílá.
 *   --json  strojový výstup
 */
import { withScriptDb } from "@/lib/demo/cli";
import { REPORT_HIDE_THRESHOLD } from "@/lib/demo/constants";
import { listReported } from "@/lib/demo/service";

const rows = await withScriptDb((sql) => listReported(sql));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 1));
} else if (!rows.length) {
  console.log("demo:reported: nic nahlášeného");
} else {
  for (const r of rows) {
    const slogan = r.sloganCustom ? `„${r.sloganCustom}“ [${r.sloganStatus}]` : "(předvolba)";
    const name = r.firstName ? `${r.firstName} [${r.nameStatus}]` : "(anonym)";
    console.log(`${r.id}  #${r.index + 1}  nahlášení ${r.reportCount}${r.hidden ? "  SKRYTO" : r.reportCount >= REPORT_HIDE_THRESHOLD ? "  ČEKÁ NA KONTROLU (strop skrytí)" : ""}  ${slogan}  ${name}  ${r.updatedAt}`);
  }
  console.log(`\n${rows.length} záznamů. Zásah: pnpm demo:hide|demo:unhide|demo:ban-text <id>`);
}
