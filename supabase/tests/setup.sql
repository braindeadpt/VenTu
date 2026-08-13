-- ============================================================
-- VenTu — Supabase-compatible test setup (plain Postgres)
-- Creates the minimal Supabase surface the VenTu SQL files reference:
--   * roles anon / authenticated (used by RLS policies + grants)
--   * auth.jwt()  (used by RLS policies; returns the JWT claims from the
--     'request.jwt.claims' GUC so tests can simulate an authenticated caller)
-- The client IP GUC is 'request.headers' (set per-test via test_set_ip in
-- test-subscribe-alert.sql).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb
$$;
