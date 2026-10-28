-- Aplikační role s minimálními právy (SPEC §14.1). Heslo se nastavuje mimo repozitář
-- (ALTER ROLE kompas_app PASSWORD …), migrace ji vytvoří bez přihlášení.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kompas_app') THEN
    CREATE ROLE kompas_app NOLOGIN NOINHERIT;
  END IF;
  -- RLS je zapnuté bez politik (zavřené pro všechny ostatní role); aplikace ho obchází.
  BEGIN
    ALTER ROLE kompas_app BYPASSRLS;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'BYPASSRLS nelze nastavit – nastavte ručně';
  END;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO kompas_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO kompas_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO kompas_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kompas_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO kompas_app;
--> statement-breakpoint
-- Schéma app nesmí být dostupné přes Data API (role Supabase anon/authenticated).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA app FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA app FROM anon, authenticated';
  END IF;
END
$$;
