/**
 * SPEC §14.1 – schéma `app` (ne `public`), tabulky a pole, RLS bez politik, enum úrovní ověření.
 * DB = PGlite přes pglite-socket s migracemi ze supabase/migrations (SPEC §2).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT } from "./helpers/content";
import { startTestDb, type TestDb } from "./helpers/runtime";

const SPEC_TABLES: Record<string, string[]> = {
  signature: ["id", "answers", "content_version", "region", "age_group", "municipality_size", "comment", "verification_level", "verified_at", "withdrawn_at", "is_seed", "is_poc", "created_at"],
  signer: ["id", "signature_id", "name_enc", "show_name", "email_enc", "email_hmac", "address_enc", "consent_at"],
  signature_version: ["signature_id", "answers", "content_version", "created_at"],
  email_token: ["signer_id", "token_hash", "purpose", "expires_at", "used_at"],
  email_job: ["id", "signer_id", "kind", "status", "attempts", "next_attempt_at", "last_error"],
  organization: ["id", "name", "type", "contact", "invited_at", "token_hash", "submitted_at", "answers", "justifications", "is_seed"],
  event_counter: ["kind", "key", "day", "count"],
  rate_limit: ["bucket", "window_start", "count"],
};

let db: TestDb;
beforeAll(async () => {
  db = await startTestDb();
});
afterAll(async () => {
  await db?.stop();
});

describe("§14.1 schéma app", () => {
  it("migrace jsou v supabase/migrations/*.sql", () => {
    const files = readdirSync(path.join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(0);
  });

  it("všechny tabulky ze SPEC jsou ve schématu app, ne v public", async () => {
    const rows = await db.sql<{ table_schema: string; table_name: string }[]>`
      select table_schema, table_name from information_schema.tables
      where table_name in ${db.sql(Object.keys(SPEC_TABLES))} and table_type = 'BASE TABLE'`;
    for (const t of Object.keys(SPEC_TABLES)) {
      expect(rows.filter((r) => r.table_name === t).map((r) => r.table_schema), t).toEqual(["app"]);
    }
  });

  for (const [table, cols] of Object.entries(SPEC_TABLES)) {
    it(`app.${table} má pole ${cols.join(", ")}`, async () => {
      const rows = await db.sql<{ column_name: string }[]>`
        select column_name from information_schema.columns where table_schema = 'app' and table_name = ${table}`;
      const have = rows.map((r) => r.column_name);
      for (const c of cols) expect(have, `${table}.${c}`).toContain(c);
    });
  }

  it("RLS je zapnuté na všech tabulkách ve schématu app", async () => {
    const r = await db.sql<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app' and c.relkind in ('r', 'p')`;
    expect(r.length).toBeGreaterThanOrEqual(Object.keys(SPEC_TABLES).length);
    for (const t of r) expect(t.relrowsecurity, t.relname).toBe(true);
  });

  it("na schématu app nejsou žádné RLS politiky", async () => {
    const p = await db.sql`select policyname from pg_policies where schemaname = 'app'`;
    expect(p).toHaveLength(0);
  });

  it("verification_level: unverified, email + připravené sms, bankid (§7.2)", async () => {
    const r = await db.sql<{ enumlabel: string }[]>`
      select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'app' and t.typname = 'verification_level' order by e.enumsortorder`;
    expect(r.map((x) => x.enumlabel)).toEqual(expect.arrayContaining(["unverified", "email", "sms", "bankid"]));
  });

  it("signer.email_hmac je unique (jeden e-mail = jeden podpis)", async () => {
    const r = await db.sql<{ indexdef: string }[]>`
      select indexdef from pg_indexes where schemaname = 'app' and tablename = 'signer' and indexdef ilike '%unique%' and indexdef ilike '%email_hmac%'`;
    expect(r.length).toBeGreaterThan(0);
  });

  it("signature nemá žádné sloupce s osobními údaji", async () => {
    const rows = await db.sql<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_schema = 'app' and table_name = 'signature'`;
    for (const c of rows.map((r) => r.column_name)) expect(c).not.toMatch(/(^|_)(name|email|address|ip|phone)(_|$)/);
  });

  it("tokeny a osobní údaje nemají sloupce v otevřené podobě", async () => {
    const rows = await db.sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns where table_schema = 'app'`;
    const cols = rows.map((r) => `${r.table_name}.${r.column_name}`);
    for (const c of ["signer.name", "signer.email", "signer.address", "email_token.token", "organization.token", "rate_limit.ip"])
      expect(cols).not.toContain(c);
  });

  it("migrace nezpřístupňují schéma app rolím Data API (anon, authenticated)", () => {
    const dir = path.join(ROOT, "supabase", "migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
    expect(sql).not.toMatch(/grant[^;]*on\s+(schema\s+)?"?app"?[^;]*to[^;]*\b(anon|authenticated)\b/i);
    expect(sql).not.toMatch(/grant[^;]*on\s+all\s+tables\s+in\s+schema\s+"?app"?[^;]*\b(anon|authenticated)\b/i);
  });
});
