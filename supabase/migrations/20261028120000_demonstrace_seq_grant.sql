-- seed:demonstrace, seed:clear a poc:clear srovnávají sekvenci pořadí (setval) – potřebují UPDATE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kompas_app') THEN
    EXECUTE 'GRANT UPDATE ON SEQUENCE app.demonstrator_position_seq TO kompas_app';
  END IF;
END
$$;
