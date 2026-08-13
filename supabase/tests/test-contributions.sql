-- ============================================================
-- VenTu — Integration tests for the community tips flow
-- (supabase-contributions.sql + migration-c3 + score-feedback +
--  supabase-contributions-harden-rpc.sql)
--
-- Guarantee under test: the contributor's email NEVER leaves the table.
--   * anon can submit via the hardened RPC (rate-limited per IP)
--   * anon / non-admin authenticated can NEVER read contributions
--   * only is_ventu_admin() (app_metadata.role = 'admin') can SELECT,
--     including the email column
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

-- Supabase grants table privileges broadly to authenticated by default;
-- model that posture so the RLS policies are actually exercised.
GRANT SELECT ON contributions TO authenticated;

-- ── 1. anon cannot read contributions (email stays in the table) ──
-- 1a. privilege layer: anon has no SELECT privilege
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM contributions;
    RAISE EXCEPTION '1a: anon SELECT should be denied by privileges';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;

-- 1b. RLS layer: even WITH SELECT granted, RLS hides every row from anon
--     (there is no anon SELECT policy)
GRANT SELECT ON contributions TO anon;
SET ROLE anon;
SELECT test_expect(
  (SELECT count(*) FROM contributions) = 0,
  '1b: RLS hides all contributions from anon'
);
RESET ROLE;
REVOKE SELECT ON contributions FROM anon;

-- 1c. anon cannot UPDATE or DELETE (status only changes via admin)
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    UPDATE contributions SET status = 'done' WHERE id = 1;
    RAISE EXCEPTION '1c: anon UPDATE should be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
  BEGIN
    DELETE FROM contributions WHERE id = 1;
    RAISE EXCEPTION '1c: anon DELETE should be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;

-- ── 2. anon CAN submit a tip via the hardened RPC ──
SET ROLE anon;
SELECT test_set_ip('203.0.113.5');
DO $$
DECLARE r jsonb;
BEGIN
  -- Named args: matches how the real client (FeedbackForm.tsx) calls the RPC,
  -- and is immune to the required-params-first signature ordering.
  r := public.submit_contribution(
    p_type => 'tip', p_message => 'Dica: estacionamento junto ao molhe',
    p_client_id => 'client-tip-1', p_email => 'tipper@example.com',
    p_locale => 'pt', p_spot_slug => 'moledo', p_tip_field => 'parking'
  )::jsonb;
  IF (r ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION '2a: tip submit via RPC failed: %', r;
  END IF;
END $$;
RESET ROLE;

-- The email IS stored (needed for admin follow-up) and client_ip recorded.
SELECT test_expect(
  (SELECT email = 'tipper@example.com' AND client_ip = '203.0.113.5'
   FROM contributions WHERE email = 'tipper@example.com'),
  '2b: tip row stored with email + client_ip'
);

-- ── 3. per-IP rate limit on submit_contribution (max 5 / 60s) ──
SET ROLE anon;
SELECT test_set_ip('198.51.100.40');
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..5 LOOP
    r := public.submit_contribution(
      p_type => 'idea', p_message => 'Ideia ' || i, p_client_id => 'client-rl-' || i
    )::jsonb;
    IF (r ->> 'ok') <> 'true' THEN
      RAISE EXCEPTION '3a: contribution % from fresh IP should pass, got %', i, r;
    END IF;
  END LOOP;
  r := public.submit_contribution(
    p_type => 'idea', p_message => 'Ideia 6', p_client_id => 'client-rl-6'
  )::jsonb;
  IF (r ->> 'ok') = 'true' OR (r ->> 'error') <> 'rate_limit' THEN
    RAISE EXCEPTION '3b: 6th contribution from same IP must be rate-limited, got %', r;
  END IF;
END $$;
RESET ROLE;

-- ── 4. admin-only SELECT: email visible ONLY to is_ventu_admin() ──
-- 4a. authenticated non-admin: RLS returns zero rows (email hidden)
SELECT set_config('request.jwt.claims', '{"app_metadata":{"role":"user"}}', false);
SET ROLE authenticated;
SELECT test_expect(
  (SELECT count(*) FROM contributions) = 0,
  '4a: non-admin authenticated sees no rows (email hidden)'
);
RESET ROLE;

-- 4b/4c. authenticated admin: sees the tip row INCLUDING the email
SELECT set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', false);
SET ROLE authenticated;
SELECT test_expect(
  (SELECT email FROM contributions WHERE email = 'tipper@example.com') = 'tipper@example.com',
  '4b: admin can read the stored email (admin-only)'
);
SELECT test_expect(
  (SELECT count(*) FROM contributions) >= 1,
  '4c: admin sees all contributions'
);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

-- ── 5. direct anon INSERT is revoked (RPC is the only anon write path) ──
SET ROLE anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO contributions (type, message, email, client_id)
    VALUES ('bug', 'direct insert attempt', 'hacker@example.com', 'client-x1');
    RAISE EXCEPTION '5: direct anon INSERT should have been denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;

-- ── 6. input validation in submit_contribution ──
SET ROLE anon;
SELECT test_set_ip('203.0.113.60');
DO $$
DECLARE r jsonb;
BEGIN
  r := public.submit_contribution(p_type => 'nope', p_message => 'x', p_client_id => 'client-v1')::jsonb;
  IF (r ->> 'error') <> 'invalid_type' THEN RAISE EXCEPTION '6a: bad type, got %', r; END IF;

  r := public.submit_contribution(p_type => 'bug', p_message => '', p_client_id => 'client-v2')::jsonb;
  IF (r ->> 'error') <> 'invalid_message' THEN RAISE EXCEPTION '6b: empty message, got %', r; END IF;

  r := public.submit_contribution(p_type => 'bug', p_message => 'x', p_client_id => 'client-v3', p_email => 'bad-email')::jsonb;
  IF (r ->> 'error') <> 'invalid_email' THEN RAISE EXCEPTION '6c: bad email, got %', r; END IF;

  r := public.submit_contribution(p_type => 'bug', p_message => 'x', p_client_id => 'short')::jsonb;
  IF (r ->> 'error') <> 'invalid_client' THEN RAISE EXCEPTION '6d: short client_id, got %', r; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'ALL CONTRIBUTIONS INTEGRATION TESTS PASSED'; END $$;
