-- ============================================================
-- VenTu — profiles.plan lockdown (#454)
--
-- Guarantees under test:
--   * authenticated can UPDATE own `locale` (the only user-editable column);
--   * authenticated CANNOT write `plan` — the column grant denies it (the old
--     blanket UPDATE let any user grant themselves 'pro');
--   * even through a privileged path (superuser/SECURITY DEFINER), a write
--     with non-admin JWT claims has `plan` forced back by the trigger;
--   * admin JWT claims (app_metadata.role = 'admin') can still change plan;
--   * verify_alert_subscription / unsubscribe_alert are callable by anon AND
--     authenticated (a signed-in user clicking an email link must not get
--     "permission denied").
-- Requires: setup.sql, supabase-auth-profiles.sql, supabase-alerts-harden-legacy.sql.
-- ============================================================

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

-- ── 0. Fixture: one free user ──
INSERT INTO auth.users (id, email)
VALUES ('11111111-2222-3333-4444-555555555555', 'free-user@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, locale, plan)
VALUES ('11111111-2222-3333-4444-555555555555', 'pt', 'free')
ON CONFLICT (id) DO UPDATE SET plan = 'free';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-2222-3333-4444-555555555555","role":"authenticated"}',
  false
);

-- ── 1. authenticated CAN update own locale ──
SET ROLE authenticated;
UPDATE profiles SET locale = 'en' WHERE id = '11111111-2222-3333-4444-555555555555';
RESET ROLE;

SELECT test_expect(
  (SELECT locale FROM profiles WHERE id = '11111111-2222-3333-4444-555555555555') = 'en',
  '1: authenticated updates own locale'
);

-- ── 2. authenticated CANNOT write plan (column grant) ──
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE profiles SET plan = 'pro' WHERE id = '11111111-2222-3333-4444-555555555555';
    RAISE EXCEPTION '2: plan write should have been denied by the column grant';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;
RESET ROLE;

SELECT test_expect(
  (SELECT plan FROM profiles WHERE id = '11111111-2222-3333-4444-555555555555') = 'free',
  '2b: plan still free after the denied write'
);

-- ── 3. Trigger: privileged write with NON-ADMIN claims is forced back ──
-- (runs as the superuser to skip the column grant — simulates a SECURITY
-- DEFINER RPC or console path while the JWT still says non-admin.)
UPDATE profiles SET plan = 'pro' WHERE id = '11111111-2222-3333-4444-555555555555';
SELECT test_expect(
  (SELECT plan FROM profiles WHERE id = '11111111-2222-3333-4444-555555555555') = 'free',
  '3: trigger forces plan back for non-admin claims'
);

-- ── 4. Admin claims CAN change plan ──
SELECT set_config('request.jwt.claims', '{"app_metadata":{"role":"admin"}}', false);
UPDATE profiles SET plan = 'pro' WHERE id = '11111111-2222-3333-4444-555555555555';
SELECT test_expect(
  (SELECT plan FROM profiles WHERE id = '11111111-2222-3333-4444-555555555555') = 'pro',
  '4: admin plan write allowed'
);
UPDATE profiles SET plan = 'free' WHERE id = '11111111-2222-3333-4444-555555555555';

-- ── 4b. Grants ao nível da API (a prova directa — sem depender do trigger) ──
-- NENHUM papel da API pode escrever `plan` (nem admin via PostgREST): a
-- gestão de planos acontece por service_role/dashboard. `locale` fica
-- editável pelo próprio utilizador.
SELECT test_expect(
  has_column_privilege('authenticated', 'public.profiles', 'plan', 'update') = false,
  '4b: authenticated sem grant UPDATE em plan (API)'
);
SELECT test_expect(
  has_column_privilege('authenticated', 'public.profiles', 'locale', 'update'),
  '4c: authenticated mantém grant UPDATE em locale (API)'
);
SELECT test_expect(
  has_column_privilege('anon', 'public.profiles', 'plan', 'update') = false,
  '4d: anon sem grant UPDATE em plan (API)'
);

-- ── 4e. service_role (dashboard/RPC service) NÃO é travado pelo trigger ──
-- auth.jwt() de um service key não traz app_metadata.role='admin' — se o
-- trigger não exceptuasse service_role, o plan ficava imutável para sempre.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
UPDATE profiles SET plan = 'pro' WHERE id = '11111111-2222-3333-4444-555555555555';
SELECT test_expect(
  (SELECT plan FROM profiles WHERE id = '11111111-2222-3333-4444-555555555555') = 'pro',
  '4e: service_role plan write allowed (dashboard path)'
);
UPDATE profiles SET plan = 'free' WHERE id = '11111111-2222-3333-4444-555555555555';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11111111-2222-3333-4444-555555555555","role":"authenticated"}',
  false
);

-- ── 5. Legacy alert RPCs callable by anon AND authenticated (#454) ──
SELECT test_expect(
  has_function_privilege('anon', 'public.verify_alert_subscription(text)', 'EXECUTE'),
  '5a: anon executes verify_alert_subscription'
);
SELECT test_expect(
  has_function_privilege('authenticated', 'public.verify_alert_subscription(text)', 'EXECUTE'),
  '5b: authenticated executes verify_alert_subscription'
);
SELECT test_expect(
  has_function_privilege('anon', 'public.unsubscribe_alert(text)', 'EXECUTE'),
  '5c: anon executes unsubscribe_alert'
);
SELECT test_expect(
  has_function_privilege('authenticated', 'public.unsubscribe_alert(text)', 'EXECUTE'),
  '5d: authenticated executes unsubscribe_alert'
);

DO $$ BEGIN RAISE NOTICE 'ALL PROFILES/GRANTS INTEGRATION TESTS PASSED'; END $$;
