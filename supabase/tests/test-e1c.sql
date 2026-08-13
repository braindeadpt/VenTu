-- ============================================================
-- VenTu — Integration tests for the hardened E1c alert flow
-- (supabase-auth-profiles.sql + supabase-alerts-e1c.sql +
--  supabase-alerts-e1c-harden.sql)
--
-- Under test:
--   * subscribe_favorites_alerts is authenticated + per-IP limited (10/60s),
--     keeps the per-user 30s secondary limit, records client_ip
--   * verify_user_alerts / unsubscribe_user_alerts (anon) are per-IP limited
--     (30/60s) — brute-force / verification-email flood guard
--   * deactivate_user_alerts (authenticated) is per-IP limited (10/60s)
--   * direct INSERT/UPDATE/DELETE on user_alert_prefs is revoked for
--     anon AND authenticated — the RPCs are the only write paths
-- Run by supabase/tests/run-tests.sh. Every assertion raises on failure;
-- psql runs with ON_ERROR_STOP so the first failure aborts the run.
-- ============================================================

-- ── Helpers (recreated: each test file is self-contained) ──
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

CREATE OR REPLACE FUNCTION test_set_ip(ip text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.headers', format('{"x-forwarded-for":"%s"}', ip), false);
END;
$$;

-- Simulate the authenticated caller (JWT sub = the user UUID).
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

-- Supabase grants table privileges broadly to authenticated by default;
-- model that posture so the RLS self-read policy is actually exercised.
-- (Writes stay revoked by the harden migration — proven in §9.)
GRANT SELECT ON user_alert_prefs TO authenticated;

-- ── 0. Fixture: users with favorites (auth.users FK + user_favorites) ──
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'e1c-alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'e1c-bob@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_favorites (user_id, spot_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'moledo'),
  ('11111111-1111-1111-1111-111111111111', 'baleal'),
  ('22222222-2222-2222-2222-222222222222', 'moledo')
ON CONFLICT DO NOTHING;

-- ── 1. Happy path (authenticated): subscribe → row + server token + IP ──
SELECT test_login('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
SELECT test_set_ip('10.99.0.1');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_favorites_alerts(70, 'kitesurf', 'pt', 'digest')::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '1a: subscribe should succeed, got %', r;
  END IF;
  IF (r ->> 'verified') <> 'false' THEN
    RAISE EXCEPTION '1a: new row must be unverified, got %', r;
  END IF;
  IF (r ->> 'favorite_count')::int <> 2 THEN
    RAISE EXCEPTION '1a: favorite_count should be 2, got %', r;
  END IF;
END $$;
RESET ROLE;

SELECT test_expect(
  (SELECT client_ip = '10.99.0.1' FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '1b: client_ip recorded from x-forwarded-for'
);
SELECT test_expect(
  (SELECT verify_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '1c: verify_token is a server-generated UUID'
);

-- ── 2. Per-user 30s secondary limit still applies ──
SELECT test_login('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
SELECT test_set_ip('10.99.0.2');
DO $$
BEGIN
  BEGIN
    PERFORM public.subscribe_favorites_alerts(80, 'surf', 'pt', 'digest');
    RAISE EXCEPTION '2: re-subscribe within 30s must be rate-limited';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rate_limit' THEN
      RAISE EXCEPTION '2: expected rate_limit, got %', SQLERRM;
    END IF;
  END;
END $$;
RESET ROLE;

-- ── 3. Per-IP limit on subscribe_favorites_alerts (max 10 / 60s) ──
-- 11 users, each with favorites, all subscribed from the same IP.
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..11 LOOP
    INSERT INTO auth.users (id, email)
    VALUES (('30000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'e1c-user-' || i || '@example.com')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO user_favorites (user_id, spot_id)
    VALUES (('30000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'moledo')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

SELECT test_login('30000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SELECT test_set_ip('10.99.1.1');
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..10 LOOP
    PERFORM set_config('request.jwt.claims',
      format('{"sub":"%s","app_metadata":{"role":"user"}}',
        ('30000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::text),
      false);
    r := public.subscribe_favorites_alerts(70, 'kitesurf', 'pt', 'digest')::jsonb;
    IF (r ->> 'ok') <> 'true' THEN
      RAISE EXCEPTION '3a: subscribe % from a fresh IP should succeed, got %', i, r;
    END IF;
  END LOOP;
  -- 11th call, same IP → per-IP window (10/60s) blocks it
  PERFORM set_config('request.jwt.claims',
    '{"sub":"30000000-0000-0000-0000-000000000011","app_metadata":{"role":"user"}}', false);
  BEGIN
    r := public.subscribe_favorites_alerts(70, 'kitesurf', 'pt', 'digest')::jsonb;
    RAISE EXCEPTION '3b: 11th subscribe from the same IP must be rate-limited, got %', r;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rate_limit' THEN
      RAISE EXCEPTION '3b: expected rate_limit, got %', SQLERRM;
    END IF;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- ── 4. Verify flow (anon): token verifies + idempotent re-verify ──
SELECT test_set_ip('10.99.2.1');
SELECT test_expect(
  (SELECT public.verify_user_alerts(verify_token)
   FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '4a: verify by server token'
);
SELECT test_expect(
  (SELECT verified FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '4b: verified flag set'
);
SELECT test_expect(
  (SELECT public.verify_user_alerts(verify_token)
   FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '4c: re-verify is idempotent (already-verified link still true)'
);

-- ── 5. Per-IP limit on verify_user_alerts (max 30 / 60s) ──
SELECT test_set_ip('10.99.3.1');
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..30 LOOP
    IF public.verify_user_alerts('nonexistent-token-' || i) THEN
      RAISE EXCEPTION '5a: bogus token must return false';
    END IF;
  END LOOP;
  BEGIN
    PERFORM public.verify_user_alerts('nonexistent-token-31');
    RAISE EXCEPTION '5b: 31st verify from the same IP must be rate-limited';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rate_limit' THEN
      RAISE EXCEPTION '5b: expected rate_limit, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ── 6. Unsubscribe flow (anon): token deactivates ──
SELECT test_set_ip('10.99.4.1');
SELECT test_expect(
  (SELECT public.unsubscribe_user_alerts(verify_token)
   FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '6a: unsubscribe by token'
);
SELECT test_expect(
  NOT (SELECT active FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '6b: active flag cleared'
);
-- Already-inactive token → false (not an error)
SELECT test_expect(
  NOT (SELECT public.unsubscribe_user_alerts(verify_token)
       FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  '6c: second unsubscribe returns false'
);

-- ── 7. deactivate_user_alerts (authenticated) ──
SELECT test_login('22222222-2222-2222-2222-222222222222');
SET ROLE authenticated;
SELECT test_set_ip('10.99.5.1');
DO $$
BEGIN
  IF public.subscribe_favorites_alerts(75, 'surf', 'pt', 'immediate')::jsonb ->> 'ok' <> 'true' THEN
    RAISE EXCEPTION '7a: bob subscribe failed';
  END IF;
END $$;
SELECT test_expect(
  (SELECT public.deactivate_user_alerts()),
  '7b: deactivate from account UI'
);
SELECT test_expect(
  NOT (SELECT active FROM user_alert_prefs WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  '7c: bob alerts deactivated'
);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- ── 8. Validation: invalid score is a clean jsonb error; anon is rejected ──
SELECT test_login('22222222-2222-2222-2222-222222222222');
SET ROLE authenticated;
SELECT test_set_ip('10.99.6.1');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_favorites_alerts(150, 'surf', 'pt', 'digest')::jsonb;
  IF (r ->> 'error') <> 'invalid_score' THEN
    RAISE EXCEPTION '8a: score 150 must return invalid_score, got %', r;
  END IF;
END $$;
RESET ROLE;

-- anon cannot subscribe (authenticated-only RPC)
SELECT set_config('request.jwt.claims', '', false); -- clear leftover claims from 8a
SELECT test_set_ip('10.99.6.2');
DO $$
BEGIN
  BEGIN
    PERFORM public.subscribe_favorites_alerts(70, 'surf', 'pt', 'digest');
    RAISE EXCEPTION '8b: anon subscribe must raise not_authenticated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'not_authenticated' THEN
      RAISE EXCEPTION '8b: expected not_authenticated, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ── 9. Direct writes revoked for anon AND authenticated ──
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO user_alert_prefs (user_id, email, min_score, sport, verify_token)
    VALUES ('11111111-1111-1111-1111-111111111111', 'hack@example.com', 70, 'surf', 'hack-token-1');
    RAISE EXCEPTION '9a: direct anon INSERT must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  BEGIN
    UPDATE user_alert_prefs SET active = true WHERE user_id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION '9b: direct anon UPDATE must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  BEGIN
    DELETE FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION '9c: direct anon DELETE must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;

-- authenticated: RLS would normally allow self-writes; privileges are revoked.
SELECT test_login('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO user_alert_prefs (user_id, email, min_score, sport, verify_token)
    VALUES ('11111111-1111-1111-1111-111111111111', 'self@example.com', 70, 'surf', 'self-token-1');
    RAISE EXCEPTION '9d: direct authenticated INSERT must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  BEGIN
    UPDATE user_alert_prefs SET active = true WHERE user_id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION '9e: direct authenticated UPDATE must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  BEGIN
    DELETE FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111';
    RAISE EXCEPTION '9f: direct authenticated DELETE must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- ── 10. Users can still read their own prefs (SELECT policy untouched) ──
SELECT test_login('22222222-2222-2222-2222-222222222222');
SET ROLE authenticated;
SELECT test_expect(
  (SELECT count(*) FROM user_alert_prefs WHERE user_id = '22222222-2222-2222-2222-222222222222') = 1,
  '10a: user reads own alert prefs'
);
SELECT test_expect(
  (SELECT count(*) FROM user_alert_prefs WHERE user_id = '11111111-1111-1111-1111-111111111111') = 0,
  '10b: user cannot read another user prefs'
);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

DO $$ BEGIN RAISE NOTICE 'ALL E1C INTEGRATION TESTS PASSED'; END $$;
