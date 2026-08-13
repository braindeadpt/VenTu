-- ============================================================
-- VenTu — Integration tests for the hardened subscribe_alert RPC
-- (supabase/supabase-alerts-harden-legacy.sql)
--
-- Run by supabase/tests/run-tests.sh against a real Postgres after
-- supabase-alerts.sql. Every assertion raises on failure; psql runs with
-- ON_ERROR_STOP so the first failure aborts the whole run.
-- ============================================================

-- ── Helpers ──
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

-- Simulate the Supabase gateway setting X-Forwarded-For on the request.
CREATE OR REPLACE FUNCTION test_set_ip(ip text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.headers', format('{"x-forwarded-for":"%s"}', ip), false);
END;
$$;

-- ── 0. Schema: the hardened RPC replaced the legacy signatures ──
SELECT test_expect(
  (SELECT count(*) FROM pg_proc WHERE proname = 'subscribe_alert') = 1,
  '0a: exactly one subscribe_alert signature survives'
);

SELECT test_expect(
  (SELECT NOT EXISTS (
     SELECT 1 FROM pg_proc p, unnest(p.proargnames) AS a(name)
     WHERE p.proname = 'subscribe_alert' AND a.name = 'p_verify_token'
   )),
  '0b: no client-supplied verify_token parameter'
);

-- ── 1. Happy path: server-generated token + client_ip recorded ──
SET ROLE anon;
SELECT test_set_ip('203.0.113.10');
SELECT test_expect(
  (public.subscribe_alert('alice@example.com', 'moledo', 'surf', 70, 'client-a1b2c3d4')::jsonb ->> 'ok') = 'true',
  '1a: valid subscribe returns ok'
);
RESET ROLE;

SELECT test_expect(
  (SELECT verify_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   FROM alert_subscriptions WHERE email = 'alice@example.com'),
  '1b: verify_token is a server-generated UUID'
);

SELECT test_expect(
  (SELECT client_ip = '203.0.113.10' FROM alert_subscriptions WHERE email = 'alice@example.com'),
  '1c: client_ip recorded from x-forwarded-for'
);

-- ── 2. Per-IP rate limit: max 5 subscribe attempts / 60s ──
SET ROLE anon;
SELECT test_set_ip('198.51.100.20');
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..5 LOOP
    r := public.subscribe_alert(
      'ip' || i || '@example.com', 'spot-' || i, 'surf', 70, 'client-ip-' || i
    )::jsonb;
    IF (r ->> 'ok') <> 'true' THEN
      RAISE EXCEPTION '2a: call % from a fresh IP should succeed, got %', i, r;
    END IF;
  END LOOP;
  r := public.subscribe_alert('ip6@example.com', 'spot-6', 'surf', 70, 'client-ip-6')::jsonb;
  IF (r ->> 'ok') = 'true' OR (r ->> 'error') <> 'rate_limit' THEN
    RAISE EXCEPTION '2b: 6th call from the same IP must be rate-limited, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 3. A different IP is not blocked by the window above ──
SET ROLE anon;
SELECT test_set_ip('198.51.100.99');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_alert('other-ip@example.com', 'spot-other', 'surf', 70, 'client-other-1')::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '3: a fresh IP must pass, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 4. Comma-separated XFF: first hop is the client ──
SET ROLE anon;
SELECT test_set_ip('203.0.113.77, 9.9.9.9');
SELECT test_expect(
  (public.subscribe_alert('xff@example.com', 'spot-xff', 'surf', 70, 'client-xff-1')::jsonb ->> 'ok') = 'true',
  '4a: subscribe with comma-separated XFF ok'
);
RESET ROLE;
SELECT test_expect(
  (SELECT client_ip = '203.0.113.77' FROM alert_subscriptions WHERE email = 'xff@example.com'),
  '4b: first hop recorded as client_ip'
);

-- ── 5. Malformed XFF must not break the RPC (TEXT storage) ──
SET ROLE anon;
SELECT test_set_ip('!!!not-an-ip!!!');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_alert('malformed@example.com', 'spot-mal', 'surf', 70, 'client-mal-1')::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '5a: malformed XFF must not error the RPC, got %', r;
  END IF;
END $$;
RESET ROLE;
SELECT test_expect(
  (SELECT client_ip IS NULL FROM alert_subscriptions WHERE email = 'malformed@example.com'),
  '5b: malformed XFF stored as NULL (per-IP limit skipped)'
);

-- ── 6. Dedup: one ACTIVE row per (email, spot_slug, sport) ──
SET ROLE anon;
SELECT test_set_ip('203.0.113.99');
SELECT test_expect(
  (public.subscribe_alert('ALICE@example.com', 'moledo', 'surf', 80, 'client-x1')::jsonb ->> 'error') = 'already_exists',
  '6a: re-subscribe (case-insensitive email) returns already_exists'
);
RESET ROLE;
SELECT test_expect(
  (SELECT count(*) = 1 FROM alert_subscriptions
   WHERE lower(email) = 'alice@example.com' AND spot_slug = 'moledo' AND sport = 'surf' AND active),
  '6b: only one ACTIVE row for alice/moledo/surf'
);

-- ── 7. Re-subscribe after unsubscribe (partial unique index) ──
SELECT test_expect(
  (SELECT public.unsubscribe_alert(verify_token)
   FROM alert_subscriptions
   WHERE email = 'alice@example.com' AND spot_slug = 'moledo' AND sport = 'surf' AND active),
  '7a: unsubscribe by token'
);
SET ROLE anon;
SELECT test_set_ip('203.0.113.98');
SELECT test_expect(
  (public.subscribe_alert('alice@example.com', 'moledo', 'surf', 75, 'client-x2')::jsonb ->> 'ok') = 'true',
  '7b: re-subscribe after deactivation succeeds'
);
RESET ROLE;
SELECT test_expect(
  (SELECT count(*) = 1 FROM alert_subscriptions
   WHERE lower(email) = 'alice@example.com' AND spot_slug = 'moledo' AND sport = 'surf' AND active),
  '7c: still exactly one ACTIVE row'
);

-- ── 8. Cap of 5 unverified per email (anti verification-email flood) ──
SET ROLE anon;
SELECT test_set_ip('192.0.2.30');
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..5 LOOP
    r := public.subscribe_alert(
      'cap@example.com', 'cap-spot-' || i, 'surf', 70, 'client-cap-' || i
    )::jsonb;
    IF (r ->> 'ok') <> 'true' THEN
      RAISE EXCEPTION '8a: unverified insert % should succeed, got %', i, r;
    END IF;
  END LOOP;
END $$;
-- 6th from a DIFFERENT IP: the same IP would hit the 60s per-IP window first,
-- and we want to prove the unverified cap itself rejects the call.
SELECT test_set_ip('192.0.2.31');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_alert('cap@example.com', 'cap-spot-6', 'surf', 70, 'client-cap-6')::jsonb;
  IF (r ->> 'ok') = 'true' OR (r ->> 'error') <> 'too_many_pending' THEN
    RAISE EXCEPTION '8b: 6th unverified sub for the email must be rejected, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 9. Input validation ──
SET ROLE anon;
SELECT test_set_ip('203.0.113.50');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.subscribe_alert('not-an-email', 'x', 'surf', 70, 'client-val-1')::jsonb;
  IF (r ->> 'error') <> 'invalid_email' THEN RAISE EXCEPTION '9a: bad email, got %', r; END IF;

  r := public.subscribe_alert('val@example.com', 'x', 'surf', 150, 'client-val-2')::jsonb;
  IF (r ->> 'error') <> 'invalid_score' THEN RAISE EXCEPTION '9b: score 150, got %', r; END IF;

  r := public.subscribe_alert('val@example.com', '', 'surf', 70, 'client-val-3')::jsonb;
  IF (r ->> 'error') <> 'invalid_slug' THEN RAISE EXCEPTION '9c: empty slug, got %', r; END IF;

  r := public.subscribe_alert('val@example.com', 'x', repeat('s', 41), 70, 'client-val-4')::jsonb;
  IF (r ->> 'error') <> 'invalid_sport' THEN RAISE EXCEPTION '9d: sport over 40 chars, got %', r; END IF;

  r := public.subscribe_alert('val@example.com', 'x', 'surf', 70, 'short')::jsonb;
  IF (r ->> 'error') <> 'invalid_client' THEN RAISE EXCEPTION '9e: short client_id, got %', r; END IF;
END $$;
RESET ROLE;

-- ── 10. Verify flow with the server token ──
SELECT test_expect(
  (SELECT public.verify_alert_subscription(verify_token)
   FROM alert_subscriptions WHERE email = 'other-ip@example.com'),
  '10a: verify by token'
);
SELECT test_expect(
  (SELECT verified FROM alert_subscriptions WHERE email = 'other-ip@example.com'),
  '10b: verified flag set'
);
SELECT test_expect(
  NOT (SELECT public.verify_alert_subscription(verify_token)
       FROM alert_subscriptions WHERE email = 'other-ip@example.com'),
  '10c: second verify returns false'
);

-- ── 11. Direct anon INSERT is revoked (RPC is the only anon write path) ──
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO alert_subscriptions (email, spot_slug, sport, min_score, verify_token, verified, active, client_id)
    VALUES ('hacker@example.com', 'x', 'surf', 70, 'hack-token-1', false, true, 'client-hack-1');
    RAISE EXCEPTION '11: direct anon INSERT should have been denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;

RAISE NOTICE 'ALL SUBSCRIBE_ALERT INTEGRATION TESTS PASSED';
