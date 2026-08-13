-- ============================================================
-- VenTu — Integration tests for the combined E1c→E1 legacy token RPCs
-- (verify_alert_token / unsubscribe_alert_token, defined in
--  supabase-alerts-e1c.sql; hardened transitively via the E1c sub-calls
--  verify_user_alerts / unsubscribe_user_alerts).
--
-- Under test:
--   * verify_alert_token verifies an E1c token (user_alert_prefs) first,
--     then falls through to the E1 legacy path (alert_subscriptions)
--   * unsubscribe_alert_token deactivates E1c then legacy
--   * the per-IP rate limit is TRANSITIVE: every combined call burns the
--     inner E1c ledger bucket (verify_user_alerts / unsubscribe_user_alerts,
--     30/60s) BEFORE any table lookup — a legacy-only token cannot bypass
--     the per-IP limit through the combined RPC
--   * verify and unsubscribe buckets are action-scoped (independent)
--
-- Run by supabase/tests/run-tests.sh after test-e1c.sql. IPs use the
-- 10.99.20.x range (no collision with the other suites). Every assertion
-- raises on failure; psql runs with ON_ERROR_STOP.
-- ============================================================

-- ── Helpers (self-contained, same pattern as test-e1c.sql) ──
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

-- ── 0. Fixtures ──
-- 0a. E1c user + favorite + subscription (server token via the real RPC)
INSERT INTO auth.users (id, email) VALUES
  ('44444444-4444-4444-4444-444444444444', 'chain-alice@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_favorites (user_id, spot_id) VALUES
  ('44444444-4444-4444-4444-444444444444', 'moledo')
ON CONFLICT DO NOTHING;

SELECT test_login('44444444-4444-4444-4444-444444444444');
SET ROLE authenticated;
SELECT test_set_ip('10.99.20.1');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_favorites_alerts(70, 'surf', 'pt', 'digest')::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '0a: subscribe failed: %', r;
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- Capture the server token (owner session, RLS bypassed) + the legacy token.
SELECT verify_token AS e1c_token
FROM user_alert_prefs WHERE user_id = '44444444-4444-4444-4444-444444444444' \gset
\set legacy_token 'legacy-chain-token-0001'

-- 0b. E1 legacy row (alert_subscriptions) with a known server token
INSERT INTO alert_subscriptions
  (email, spot_slug, sport, min_score, verify_token, verified, active, client_id, locale)
VALUES
  ('chain-legacy@example.com', 'moledo', 'surf', 70, :'legacy_token', false, true, 'chain-client-01', 'pt');

-- ── 1. E1c token via verify_alert_token (chain hits the E1c branch) ──
SET ROLE anon;
SELECT test_set_ip('10.99.20.2');
SELECT test_expect(
  (SELECT public.verify_alert_token(:'e1c_token')),
  '1a: verify E1c token through the combined RPC'
);
SELECT test_expect(
  (SELECT public.verify_alert_token(:'e1c_token')),
  '1c: re-verify E1c token is idempotent (true)'
);
RESET ROLE;
-- State check as owner (anon has no SELECT on user_alert_prefs)
SELECT test_expect(
  (SELECT verified FROM user_alert_prefs WHERE user_id = '44444444-4444-4444-4444-444444444444'),
  '1b: E1c row verified after combined verify'
);

-- ── 2. Legacy E1 token via verify_alert_token (chain falls to E1 legacy) ──
SET ROLE anon;
SELECT test_set_ip('10.99.20.3');
SELECT test_expect(
  (SELECT public.verify_alert_token(:'legacy_token')),
  '2a: verify legacy token through the combined RPC'
);
SELECT test_expect(
  (SELECT public.verify_alert_token(:'legacy_token')),
  '2c: re-verify legacy token is idempotent (true)'
);
RESET ROLE;
-- State check as owner
SELECT test_expect(
  (SELECT verified FROM alert_subscriptions WHERE verify_token = :'legacy_token'),
  '2b: legacy row verified after combined verify'
);

-- ── 3. Transitive per-IP rate limit on verify_alert_token (30/60s) ──
-- The inner verify_user_alerts records a ledger event BEFORE any table
-- lookup, so 30 combined calls exhaust the bucket regardless of token.
SET ROLE anon;
SELECT test_set_ip('10.99.20.4');
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..30 LOOP
    IF public.verify_alert_token('bogus-verify-token-' || i) THEN
      RAISE EXCEPTION '3a: bogus token must return false';
    END IF;
  END LOOP;
  BEGIN
    PERFORM public.verify_alert_token('bogus-verify-token-31');
    RAISE EXCEPTION '3b: 31st combined verify from the same IP must be rate-limited';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rate_limit' THEN
      RAISE EXCEPTION '3b: expected rate_limit, got %', SQLERRM;
    END IF;
  END;
END $$;
RESET ROLE;

-- 3c. A VALID legacy token cannot bypass the per-IP limit via the combined
--     RPC: the inner check fires before the E1 legacy UPDATE runs.
SET ROLE anon;
SELECT test_set_ip('10.99.20.4'); -- same (exhausted) IP
DO $$
BEGIN
  BEGIN
    -- psql não interpola variáveis dentro de DO blocks — usa-se o literal
    PERFORM public.verify_alert_token('legacy-chain-token-0001');
    RAISE EXCEPTION '3c: legacy branch must not bypass the per-IP limit';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rate_limit' THEN
      RAISE EXCEPTION '3c: expected rate_limit, got %', SQLERRM;
    END IF;
  END;
END $$;
RESET ROLE;
SELECT test_expect(
  (SELECT verified FROM alert_subscriptions WHERE verify_token = :'legacy_token'),
  '3d: legacy row untouched (rate limit fired before any UPDATE)'
);

-- 3e. A different IP is not blocked (limit is per-IP, not global).
SET ROLE anon;
SELECT test_set_ip('10.99.20.5');
SELECT test_expect(
  NOT (SELECT public.verify_alert_token('bogus-fresh-ip-token')),
  '3e: fresh IP passes (per-IP window)'
);
RESET ROLE;

-- ── 4. unsubscribe_alert_token (E1c then legacy) ──
SET ROLE anon;
SELECT test_set_ip('10.99.20.6');
SELECT test_expect(
  (SELECT public.unsubscribe_alert_token(:'e1c_token')),
  '4a: unsubscribe E1c token through the combined RPC'
);
SELECT test_expect(
  NOT (SELECT public.unsubscribe_alert_token(:'e1c_token')),
  '4c: second unsubscribe of inactive E1c token returns false'
);
SELECT test_expect(
  (SELECT public.unsubscribe_alert_token(:'legacy_token')),
  '4d: unsubscribe legacy token through the combined RPC (legacy branch)'
);
RESET ROLE;
-- State checks as owner
SELECT test_expect(
  NOT (SELECT active FROM user_alert_prefs WHERE user_id = '44444444-4444-4444-4444-444444444444'),
  '4b: E1c row deactivated'
);
SELECT test_expect(
  NOT (SELECT active FROM alert_subscriptions WHERE verify_token = :'legacy_token'),
  '4e: legacy row deactivated'
);

-- ── 5. Transitive per-IP rate limit on unsubscribe_alert_token (30/60s) ──
SET ROLE anon;
SELECT test_set_ip('10.99.20.7');
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..30 LOOP
    IF public.unsubscribe_alert_token('bogus-unsub-token-' || i) THEN
      RAISE EXCEPTION '5a: bogus unsubscribe token must return false';
    END IF;
  END LOOP;
  BEGIN
    PERFORM public.unsubscribe_alert_token('bogus-unsub-token-31');
    RAISE EXCEPTION '5b: 31st combined unsubscribe from the same IP must be rate-limited';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rate_limit' THEN
      RAISE EXCEPTION '5b: expected rate_limit, got %', SQLERRM;
    END IF;
  END;
END $$;
RESET ROLE;

-- 5c. Fresh IP not blocked.
SET ROLE anon;
SELECT test_set_ip('10.99.20.8');
SELECT test_expect(
  NOT (SELECT public.unsubscribe_alert_token('bogus-fresh-ip-unsub')),
  '5c: fresh IP passes (per-IP window)'
);
RESET ROLE;

-- ── 6. Buckets are action-scoped: exhausting verify does not block unsubscribe ──
SET ROLE anon;
SELECT test_set_ip('10.99.20.9');
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..30 LOOP
    IF public.verify_alert_token('bucket-verify-' || i) THEN
      RAISE EXCEPTION '6a: bogus verify token must return false';
    END IF;
  END LOOP;
  BEGIN
    PERFORM public.verify_alert_token('bucket-verify-31');
    RAISE EXCEPTION '6b: verify bucket must be exhausted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rate_limit' THEN
      RAISE EXCEPTION '6b: expected rate_limit, got %', SQLERRM;
    END IF;
  END;
  -- Same IP, different action bucket → unsubscribe still allowed
  IF public.unsubscribe_alert_token('bucket-unsub-1') THEN
    RAISE EXCEPTION '6c: bogus unsubscribe token must return false';
  END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'ALL E1C TOKEN-CHAIN INTEGRATION TESTS PASSED'; END $$;
