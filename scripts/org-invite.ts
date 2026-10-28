/**
 * `pnpm org:invite --name "…" --type strana|hnuti|iniciativa --contact "…" [--reissue]`
 * (SPEC §12): založí subjekt v app.organization (v DB jen SHA-256 tokenu) a vypíše
 * jednorázový odkaz /org/{token} k ručnímu odeslání. Žádné admin rozhraní.
 *   --reissue  subjekt se stejným jménem, který ještě neodpověděl, dostane nový odkaz
 *              (starý přestane platit).
 * Bez DATABASE_URL použije běžící dev server (PGLITE_PORT), jinak lokální PGlite.
 */
import { parseArgs } from "node:util";
import { createSql } from "@/lib/db/client";
import { resolveScriptDatabase } from "@/lib/db/dev-server";
import { runMigrations } from "@/lib/db/migrate";
import { inviteInputSchema } from "@/lib/org/input";
import { createInvitation, InviteError } from "@/lib/org/service";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    type: { type: "string" },
    contact: { type: "string" },
    reissue: { type: "boolean", default: false },
  },
  strict: true,
});

const input = inviteInputSchema.safeParse(values);
if (!input.success) {
  const fields = [...new Set(input.error.issues.map((i) => String(i.path[0])))].join(", ");
  console.error(`org:invite: chybí nebo je neplatné: ${fields}`);
  console.error('Použití: pnpm org:invite --name "…" --type strana|hnuti|iniciativa --contact "…" [--reissue]');
  process.exit(1);
}

const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
const db = await resolveScriptDatabase();
const sql = createSql(db.url, { max: 1 });
let code = 0;
try {
  if (db.local) await runMigrations(sql);
  const inv = await createInvitation(sql, input.data, { reissue: values.reissue });
  console.log(`org:invite: ${inv.reissued ? "nový odkaz pro" : "pozván/a"} ${input.data.name} (${input.data.type})`);
  console.log(`${base}/org/${inv.token}`);
  console.log("Odkaz je jednorázový a v DB je jen jeho hash – ulož si ho hned, znovu ho nevypíšeme.");
} catch (e) {
  code = 1;
  if (e instanceof InviteError) {
    console.error(
      e.code === "submitted"
        ? "org:invite: subjekt už odpověděl, odpovědi jsou uzamčené."
        : "org:invite: subjekt se stejným jménem už je pozvaný. Nový odkaz: přidej --reissue.",
    );
  } else console.error(`org:invite: chyba DB – ${(e as Error).message}`);
} finally {
  await sql.end();
  await db.stop();
}
process.exit(code);
