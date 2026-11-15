-- ============================================================
-- VenTu — rate-limit IP extraction, forged headers and helper grants
-- (#454, part 1)
--
-- Guarantees under test:
--   * request_client_ip() trusts cf-connecting-ip, then the LAST hop of
--     x-forwarded-for. The FIRST hop is client-controlled and must never
--     decide the bucket (that was the bypass).
--   * A forged header cannot fail open: an unparseable IP lands in the shared
--     'unknown-http' bucket, so rotating it does not buy fresh quota.
--   * NULL only when there is no request context at all (SQL Editor).
--   * anon and authenticated cannot execute request_client_ip() nor
--     check_rate_limit() — the SECURITY DEFINER callers still can.
-- Requires: supabase/tests/setup.sql (Supabase default privileges modelled),
-- supabase/supabase-rate-limit-common.sql, supabase-contributions-harden-rpc.sql.
-- Run by supabase/tests/run-tests.sh; assertions raise, psql runs with
-- ON_ERROR_STOP.
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

-- TEXT (not jsonb): callers pass literals and format() results, and there is
-- no implicit text → jsonb cast.
CREATE OR REPLACE FUNCTION test_set_headers(h text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.headers', h, false);
END;
$$;

-- ── 1. Header trust order ──
SELECT test_set_headers(
  '{"cf-connecting-ip":"198.51.100.7","x-forwarded-for":"203.0.113.1, 203.0.113.2"}'
);
SELECT test_expect(
  public.request_client_ip() = '198.51.100.7',
  '1a: cf-connecting-ip wins over x-forwarded-for'
);

SELECT test_set_headers('{"x-forwarded-for":"203.0.113.1, 198.51.100.8"}');
SELECT test_expect(
  public.request_client_ip() = '198.51.100.8',
  '1b: the LAST x-forwarded-for hop is used'
);
SELECT test_expect(
  public.request_client_ip() <> '203.0.113.1',
  '1c: the first (client-controlled) hop is ignored'
);

SELECT test_set_headers('{"cf-connecting-ip":"2001:DB8::1"}');
SELECT test_expect(
  public.request_client_ip() = '2001:db8::1',
  '1d: IPv6 is validated and normalised'
);

SELECT test_set_headers('{"x-forwarded-for":"not-an-ip, 198.51.100.9"}');
SELECT test_expect(
  public.request_client_ip() = '198.51.100.9',
  '1e: junk in earlier hops does not poison a valid last hop'
);

SELECT test_set_headers('{"x-forwarded-for":"invalid"}');
SELECT test_expect(
  public.request_client_ip() = 'unknown-http',
  '1f: unparseable header → shared bucket, never NULL'
);

SELECT test_set_headers('{"cf-connecting-ip":"10.0.0.0/8"}');
SELECT test_expect(
  public.request_client_ip() = 'unknown-http',
  '1g: a CIDR is not a client IP'
);

SELECT test_set_headers('{"x-forwarded-for":""}');
SELECT test_expect(
  public.request_client_ip() = 'unknown-http',
  '1h: empty header value → shared bucket'
);

SELECT set_config('request.headers', '', false);
SELECT test_expect(
  public.request_client_ip() IS NULL,
  '1i: no request context (SQL Editor) → NULL keeps manual work unblocked'
);

-- ── 2. Rotating a forged first hop does not reset the bucket ──
-- 5/60s is submit_contribution's per-IP limit; the loop burns it with a
-- different forged first hop each time and the 6th call must still be blocked.
SET ROLE anon;
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM test_set_headers(format('{"x-forwarded-for":"10.9.%s.%s, 198.51.100.140"}', i, i));
    r := public.submit_contribution(
      p_type => 'bug', p_message => 'forged header probe', p_client_id => 'rl-forged-' || i
    )::jsonb;
    IF (r ->> 'ok') <> 'true' THEN
      RAISE EXCEPTION '2a: call % from the same real IP should pass, got %', i, r;
    END IF;
  END LOOP;

  PERFORM test_set_headers('{"x-forwarded-for":"203.0.113.250, 198.51.100.140"}');
  r := public.submit_contribution(
    p_type => 'bug', p_message => 'forged header probe', p_client_id => 'rl-forged-6'
  )::jsonb;
  IF (r ->> 'ok') = 'true' OR (r ->> 'error') <> 'rate_limit' THEN
    RAISE EXCEPTION '2b: a new forged first hop must not reset the bucket, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 3. The shared 'unknown-http' bucket is not fail-open ──
SELECT test_expect(
  public.check_rate_limit('unknown-http', 'rl-unknown-probe', 2, interval '60 seconds'),
  '3a: first call in the shared bucket passes'
);
SELECT test_expect(
  public.check_rate_limit('unknown-http', 'rl-unknown-probe', 2, interval '60 seconds'),
  '3b: second call in the shared bucket passes'
);
SELECT test_expect(
  NOT public.check_rate_limit('unknown-http', 'rl-unknown-probe', 2, interval '60 seconds'),
  '3c: third call is blocked (forged/garbage headers cannot fail open)'
);

-- ── 4. anon / authenticated cannot execute the internal helpers ──
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.request_client_ip();
    RAISE EXCEPTION '4a: anon must not execute request_client_ip()';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  BEGIN
    PERFORM public.check_rate_limit('203.0.113.77', 'rl-probe', 1, interval '60 seconds');
    RAISE EXCEPTION '4b: anon must not execute check_rate_limit()';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}',
  false
);
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.request_client_ip();
    RAISE EXCEPTION '4c: authenticated must not execute request_client_ip()';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  BEGIN
    PERFORM public.check_rate_limit('203.0.113.78', 'rl-probe', 1, interval '60 seconds');
    RAISE EXCEPTION '4d: authenticated must not execute check_rate_limit()';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- ── 5. The SECURITY DEFINER callers keep working after the REVOKE ──
SET ROLE anon;
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM test_set_headers('{"x-forwarded-for":"198.51.100.50"}');
  r := public.submit_contribution(
    p_type => 'idea', p_message => 'definer chain as anon', p_client_id => 'rl-definer-anon'
  )::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '5a: anon submit_contribution broke after the REVOKE: %', r;
  END IF;
END $$;
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"role":"user"}}',
  false
);
SET ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM test_set_headers('{"x-forwarded-for":"198.51.100.51"}');
  r := public.submit_contribution(
    p_type => 'idea', p_message => 'definer chain as authenticated', p_client_id => 'rl-definer-auth'
  )::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '5b: authenticated submit_contribution broke after the REVOKE: %', r;
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

DO $$ BEGIN RAISE NOTICE 'ALL RATE-LIMIT IP/GRANT TESTS PASSED'; END $$;
