-- Krátké číslo podpisu (DECISIONS.md, „Číslo podpisu a načtení odpovědí“): 8 znaků z Crockford
-- base32 bez I, L, O, U, zobrazené jako XXXX-XXXX. Aplikace ho generuje sama (lib/sign/short-id.ts,
-- crypto); výchozí hodnota sloupce je pojistka pro ostatní zápisy (seed demonstrace, testy, ruční SQL).
-- Náhoda z gen_random_uuid() (silný generátor, bez pgcrypto – funguje i v PGlite); bajty 6 a 8
-- (verze a varianta UUID) se nepoužívají. 256 % 32 = 0 → rovnoměrné rozdělení.
CREATE OR REPLACE FUNCTION app.random_short_id() RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = ''
AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  i int;
  res text := '';
BEGIN
  FOREACH i IN ARRAY ARRAY[0, 1, 2, 3, 4, 5, 10, 11] LOOP
    res := res || substr(alphabet, (get_byte(b, i) & 31) + 1, 1);
  END LOOP;
  RETURN res;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.random_short_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.random_short_id() TO kompas_app;
--> statement-breakpoint
ALTER TABLE "app"."signature" ADD COLUMN IF NOT EXISTS "short_id" text;
--> statement-breakpoint
-- Doplnění existujících řádků (i seed a POC) a odstranění případných kolizí před unikátním indexem.
UPDATE "app"."signature" SET "short_id" = app.random_short_id() WHERE "short_id" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  LOOP
    UPDATE app.signature s SET short_id = app.random_short_id()
    WHERE s.id IN (
      SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY short_id ORDER BY created_at, id) AS rn FROM app.signature
      ) d WHERE d.rn > 1
    );
    EXIT WHEN NOT FOUND;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signature_short_id_key" ON "app"."signature" USING btree ("short_id");
--> statement-breakpoint
ALTER TABLE "app"."signature" ALTER COLUMN "short_id" SET DEFAULT app.random_short_id();
--> statement-breakpoint
ALTER TABLE "app"."signature" ALTER COLUMN "short_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "app"."signature" DROP CONSTRAINT IF EXISTS "signature_short_id_format";
--> statement-breakpoint
ALTER TABLE "app"."signature" ADD CONSTRAINT "signature_short_id_format" CHECK ("short_id" ~ '^[0-9A-HJKMNP-TV-Z]{8}$');
