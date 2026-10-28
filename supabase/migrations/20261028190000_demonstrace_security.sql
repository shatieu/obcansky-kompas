-- Bezpečnostní review online demonstrace (DECISIONS.md, „Online demonstrace – bezpečnostní opravy“).
-- 1) consent_version: verze (hash) textu souhlasu, se kterým člověk souhlasil; obnoví se s consent_at
--    při každé úpravě. Starší řádky NULL (text souhlasu z doby před zavedením verze).
-- 2) owner_epoch: epocha cookie vlastníka ok_owner pro podpis. Cookie nese epochu, při použití se
--    porovná s DB; odvolání podpisu a odhlášení ji zvýší → všechny dřívější cookie přestanou platit.
-- Jen nové sloupce s výchozí hodnotou – granty kompas_app (DML na tabulky schématu app) platí dál.
ALTER TABLE "app"."demonstrator" ADD COLUMN IF NOT EXISTS "consent_version" text;--> statement-breakpoint
ALTER TABLE "app"."signature" ADD COLUMN IF NOT EXISTS "owner_epoch" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- 3) Globální strop automatických skrytí po nahlášení (max. N za hodinu) počítá moderation_log.
CREATE INDEX IF NOT EXISTS "moderation_log_actor_action_created_idx" ON "app"."moderation_log" USING btree ("actor","action","created_at");
