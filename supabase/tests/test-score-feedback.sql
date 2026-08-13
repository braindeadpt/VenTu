-- ============================================================
-- VenTu — Integration tests for submit_score_feedback
-- (supabase-score-feedback.sql + supabase-contributions-harden-rpc.sql)
--
-- Same hardening pattern as the other anon write paths:
--   * per-IP rate limit (15/60s) — the real boundary (client_id is rotatable)
--   * per-IP + spot + sport limit (5/h) — protects calibration quality
--   * per-client + spot + sport limit (1/h) — same-browser/NAT secondary
--   * direct anon INSERT revoked — the RPC is the only anon write path
-- Run by supabase/tests/run-tests.sh. Asserts raise on failure; psql runs
-- with ON_ERROR_STOP so the first failure aborts the run.
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

-- Supabase grants table privileges broadly to authenticated by default.
GRANT SELECT ON score_feedback TO authenticated;

-- ── 1. Happy path: anon submits via the RPC; client_ip recorded ──
SET ROLE anon;
SELECT test_set_ip('203.0.113.15');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.submit_score_feedback(
    p_spot_slug => 'moledo', p_sport => 'surf', p_predicted_score => 72,
    p_verdict => 'better', p_client_id => 'client-sf-1', p_locale => 'pt'
  )::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '1a: score feedback submit failed: %', r;
  END IF;
END $$;
RESET ROLE;

SELECT test_expect(
  (SELECT client_ip = '203.0.113.15'
   FROM score_feedback WHERE spot_slug = 'moledo' AND sport = 'surf'),
  '1b: score_feedback row stored with client_ip'
);

-- ── 2. Per-IP rate limit: max 15 / 60s (global boundary) ──
SET ROLE anon;
SELECT test_set_ip('198.51.100.60');
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..15 LOOP
    r := public.submit_score_feedback(
      p_spot_slug => 'sf-spot-' || i, p_sport => 'surf', p_predicted_score => 60,
      p_verdict => 'same', p_client_id => 'client-sf-ip-' || i
    )::jsonb;
    IF (r ->> 'ok') <> 'true' THEN
      RAISE EXCEPTION '2a: call % from fresh IP should pass, got %', i, r;
    END IF;
  END LOOP;
  r := public.submit_score_feedback(
    p_spot_slug => 'sf-spot-16', p_sport => 'surf', p_predicted_score => 60,
    p_verdict => 'same', p_client_id => 'client-sf-ip-16'
  )::jsonb;
  IF (r ->> 'ok') = 'true' OR (r ->> 'error') <> 'rate_limit' THEN
    RAISE EXCEPTION '2b: 16th call from same IP must be rate-limited, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 3. Per-IP + spot + sport: max 5 / hour (calibration quality) ──
SET ROLE anon;
SELECT test_set_ip('198.51.100.61');
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..5 LOOP
    r := public.submit_score_feedback(
      p_spot_slug => 'supertubos', p_sport => 'surf', p_predicted_score => 65,
      p_verdict => 'same', p_client_id => 'client-sf-ps-' || i
    )::jsonb;
    IF (r ->> 'ok') <> 'true' THEN
      RAISE EXCEPTION '3a: per-spot call % should pass, got %', i, r;
    END IF;
  END LOOP;
  r := public.submit_score_feedback(
    p_spot_slug => 'supertubos', p_sport => 'surf', p_predicted_score => 65,
    p_verdict => 'same', p_client_id => 'client-sf-ps-6'
  )::jsonb;
  IF (r ->> 'ok') = 'true' OR (r ->> 'error') <> 'rate_limit' THEN
    RAISE EXCEPTION '3b: 6th vote on same spot+sport must be rate-limited, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 4. Per-client + spot + sport: max 1 / hour (same-browser secondary) ──
SET ROLE anon;
SELECT test_set_ip('198.51.100.62');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.submit_score_feedback(
    p_spot_slug => 'nazare', p_sport => 'big-wave', p_predicted_score => 80,
    p_verdict => 'worse', p_client_id => 'client-sf-same-1'
  )::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '4a: first vote should pass, got %', r;
  END IF;
  r := public.submit_score_feedback(
    p_spot_slug => 'nazare', p_sport => 'big-wave', p_predicted_score => 80,
    p_verdict => 'worse', p_client_id => 'client-sf-same-1'
  )::jsonb;
  IF (r ->> 'ok') = 'true' OR (r ->> 'error') <> 'rate_limit' THEN
    RAISE EXCEPTION '4b: second vote from same client+spot+sport must be rate-limited, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 5. Direct anon INSERT is revoked (RPC is the only anon write path) ──
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO score_feedback (spot_slug, sport, predicted_score, verdict, client_id)
    VALUES ('x', 'surf', 50, 'same', 'client-hack-sf');
    RAISE EXCEPTION '5: direct anon INSERT should have been denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;

-- ── 6. Input validation ──
SET ROLE anon;
SELECT test_set_ip('203.0.113.70');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.submit_score_feedback(p_spot_slug => '', p_sport => 'surf', p_predicted_score => 50, p_verdict => 'same', p_client_id => 'client-sf-v1')::jsonb;
  IF (r ->> 'error') <> 'invalid_slug' THEN RAISE EXCEPTION '6a: empty slug, got %', r; END IF;

  r := public.submit_score_feedback(p_spot_slug => 'x', p_sport => repeat('s', 41), p_predicted_score => 50, p_verdict => 'same', p_client_id => 'client-sf-v2')::jsonb;
  IF (r ->> 'error') <> 'invalid_sport' THEN RAISE EXCEPTION '6b: sport over 40 chars, got %', r; END IF;

  r := public.submit_score_feedback(p_spot_slug => 'x', p_sport => 'surf', p_predicted_score => 101, p_verdict => 'same', p_client_id => 'client-sf-v3')::jsonb;
  IF (r ->> 'error') <> 'invalid_score' THEN RAISE EXCEPTION '6c: score 101, got %', r; END IF;

  r := public.submit_score_feedback(p_spot_slug => 'x', p_sport => 'surf', p_predicted_score => -1, p_verdict => 'same', p_client_id => 'client-sf-v4')::jsonb;
  IF (r ->> 'error') <> 'invalid_score' THEN RAISE EXCEPTION '6d: score -1, got %', r; END IF;

  r := public.submit_score_feedback(p_spot_slug => 'x', p_sport => 'surf', p_predicted_score => 50, p_verdict => 'maybe', p_client_id => 'client-sf-v5')::jsonb;
  IF (r ->> 'error') <> 'invalid_verdict' THEN RAISE EXCEPTION '6e: bad verdict, got %', r; END IF;

  r := public.submit_score_feedback(p_spot_slug => 'x', p_sport => 'surf', p_predicted_score => 50, p_verdict => 'same', p_client_id => 'short')::jsonb;
  IF (r ->> 'error') <> 'invalid_client' THEN RAISE EXCEPTION '6f: short client_id, got %', r; END IF;
END $$;
RESET ROLE;

-- ── 7. Authenticated can read calibration data (existing policy, no PII) ──
SELECT set_config('request.jwt.claims', '{"app_metadata":{"role":"user"}}', false);
SET ROLE authenticated;
SELECT test_expect(
  (SELECT count(*) FROM score_feedback) >= 1,
  '7: authenticated sees calibration rows (existing SELECT policy)'
);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

DO $$ BEGIN RAISE NOTICE 'ALL SCORE_FEEDBACK INTEGRATION TESTS PASSED'; END $$;
