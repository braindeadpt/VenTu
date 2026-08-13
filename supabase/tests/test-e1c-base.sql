-- ============================================================
-- VenTu — Integration tests for the BASE E1c migration layer
-- (supabase-alerts-e1c.sql), run BEFORE the harden replaces the RPCs.
--
-- Under test (the RPC as defined in supabase-alerts-e1c.sql):
--   * user_alert_prefs schema (PK/FK, UNIQUE server token, alert_mode CHECK)
--   * subscribe_favorites_alerts happy path: ok, verified=false, server
--     token, favorite_count — and no client identity captured yet
--   * the base RPC's OWN rate-limit pattern: per-user 30s via updated_at
--   * the UPDATE branch (re-subscribe after the window updates in place,
--     no duplicate row)
--   * no_email / no_favorites / invalid_score / not_authenticated
--   * base verify_user_alerts verifies the token
--
-- Run by supabase/tests/run-tests.sh right after supabase-alerts-e1c.sql
-- and BEFORE supabase-alerts-e1c-harden.sql. Every assertion raises on
-- failure; psql runs with ON_ERROR_STOP.
-- ============================================================

-- ── Helpers (self-contained, same pattern as the other suites) ──
CREATE OR REPLACE FUNCTION test_expect(cond boolean, label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERT FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok: %', label;
END;
$$;

CREATE OR REPLACE FUNCTION test_login(user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    format('{"sub":"%s","app_metadata":{"role":"user"}}', user_uuid::text),
    false
  );
END;
$$;

-- ── 0. Schema assertions (as owner) ──
SELECT test_expect(
  (SELECT count(*) = 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'user_alert_prefs'),
  '0a: user_alert_prefs table exists'
);
SELECT test_expect(
  (SELECT count(*) = 12 FROM information_schema.columns
   WHERE table_name = 'user_alert_prefs'
     AND column_name IN ('user_id','email','min_score','sport','verify_token',
                         'verified','active','locale','alert_mode','last_sent_at',
                         'created_at','updated_at')),
  '0b: expected columns (12)'
);
SELECT test_expect(
  (SELECT count(*) > 0 FROM pg_constraint
   WHERE conrelid = 'user_alert_prefs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%alert_mode%'),
  '0c: alert_mode CHECK constraint'
);
SELECT test_expect(
  (SELECT count(*) > 0 FROM pg_constraint
   WHERE conrelid = 'user_alert_prefs'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) LIKE '%verify_token%'),
  '0d: verify_token UNIQUE constraint'
);

-- ── 1. Fixtures ──
INSERT INTO auth.users (id, email) VALUES
  ('55555555-5555-5555-5555-555555555501', 'base-alice@example.com'),
  ('55555555-5555-5555-5555-555555555502', 'base-nofav@example.com'),
  ('55555555-5555-5555-5555-555555555503', NULL) -- user sem email (email stub nullable)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_favorites (user_id, spot_id) VALUES
  ('55555555-5555-5555-5555-555555555501', 'moledo'),
  ('55555555-5555-5555-5555-555555555501', 'baleal'),
  ('55555555-5555-5555-5555-555555555503', 'moledo') -- favorito mas sem email
ON CONFLICT DO NOTHING;
-- user 502: sem favoritos

-- ── 2. Happy path (authenticated) ──
SELECT test_login('55555555-5555-5555-5555-555555555501');
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_favorites_alerts(70, 'kitesurf', 'pt', 'digest')::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '2a: subscribe should succeed, got %', r;
  END IF;
  IF (r ->> 'verified') <> 'false' THEN
    RAISE EXCEPTION '2a: new row must be unverified, got %', r;
  END IF;
  IF (r ->> 'favorite_count')::int <> 2 THEN
    RAISE EXCEPTION '2a: favorite_count should be 2, got %', r;
  END IF;
END $$;
RESET ROLE;

SELECT test_expect(
  (SELECT verify_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   FROM user_alert_prefs WHERE user_id = '55555555-5555-5555-5555-555555555501'),
  '2b: verify_token is a server-generated UUID'
);
SELECT test_expect(
  (SELECT verified = false AND active = true AND sport = 'kitesurf' AND alert_mode = 'digest'
   FROM user_alert_prefs WHERE user_id = '55555555-5555-5555-5555-555555555501'),
  '2c: inserted row defaults (unverified, active, sport, digest)'
);

-- ── 3. Base per-user rate limit: re-subscribe within 30s → rate_limit ──
SELECT test_login('55555555-5555-5555-5555-555555555501');
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.subscribe_favorites_alerts(80, 'surf', 'pt', 'digest');
    RAISE EXCEPTION '3: re-subscribe within 30s must be rate-limited';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rate_limit' THEN
      RAISE EXCEPTION '3: expected rate_limit, got %', SQLERRM;
    END IF;
  END;
END $$;
RESET ROLE;

-- ── 4. UPDATE branch: after the window, re-subscribe updates in place ──
UPDATE user_alert_prefs
SET updated_at = now() - interval '1 minute'
WHERE user_id = '55555555-5555-5555-5555-555555555501';

SELECT test_login('55555555-5555-5555-5555-555555555501');
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_favorites_alerts(80, 'surf', 'pt', 'immediate')::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '4a: re-subscribe after the window should succeed, got %', r;
  END IF;
END $$;
RESET ROLE;

SELECT test_expect(
  (SELECT count(*) = 1 FROM user_alert_prefs WHERE user_id = '55555555-5555-5555-5555-555555555501'),
  '4b: no duplicate row (UPDATE branch)'
);
SELECT test_expect(
  (SELECT sport = 'surf' AND alert_mode = 'immediate' AND min_score = 80
   FROM user_alert_prefs WHERE user_id = '55555555-5555-5555-5555-555555555501'),
  '4c: row updated with the new values'
);

-- ── 5. no_favorites (user sem favoritos) ──
SELECT test_login('55555555-5555-5555-5555-555555555502');
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_favorites_alerts(70, 'surf', 'pt', 'digest')::jsonb;
  IF (r ->> 'error') <> 'no_favorites' THEN
    RAISE EXCEPTION '5: expected no_favorites, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 6. no_email (user com favorito mas sem email) ──
SELECT test_login('55555555-5555-5555-5555-555555555503');
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_favorites_alerts(70, 'surf', 'pt', 'digest')::jsonb;
  IF (r ->> 'error') <> 'no_email' THEN
    RAISE EXCEPTION '6: expected no_email, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 7. invalid_score / not_authenticated ──
SELECT test_login('55555555-5555-5555-5555-555555555501');
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_favorites_alerts(150, 'surf', 'pt', 'digest')::jsonb;
  IF (r ->> 'error') <> 'invalid_score' THEN
    RAISE EXCEPTION '7a: expected invalid_score, got %', r;
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.subscribe_favorites_alerts(70, 'surf', 'pt', 'digest');
    RAISE EXCEPTION '7b: anon must raise not_authenticated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_authenticated' THEN
      RAISE EXCEPTION '7b: expected not_authenticated, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ── 8. Base verify_user_alerts verifies the token ──
SELECT test_expect(
  (SELECT public.verify_user_alerts(verify_token)
   FROM user_alert_prefs WHERE user_id = '55555555-5555-5555-5555-555555555501'),
  '8a: base verify by server token'
);
SELECT test_expect(
  (SELECT verified FROM user_alert_prefs WHERE user_id = '55555555-5555-5555-5555-555555555501'),
  '8b: verified flag set'
);

DO $$ BEGIN RAISE NOTICE 'ALL E1C BASE INTEGRATION TESTS PASSED'; END $$;
