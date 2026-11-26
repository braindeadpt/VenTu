-- ============================================================
-- VenTu — Integration tests for delete_own_account()
-- (supabase/supabase-delete-account.sql + the is_ventu_admin account-
-- existence check in supabase-admin-helpers.sql)
--
-- Runs the REAL deletion end to end (PR #593 review, finding «the actual
-- deletion is not exercised by tests»): fixtures are real rows in real
-- tables and the RPC really deletes auth.users, so the cascade, the
-- legacy-alert email sweep, the directory scrub and the moderation-FK
-- ordering are all exercised against the real triggers — including the
-- protect triggers that revert owner_user_id for non-admin JWTs.
--
-- Requires (applied by run-tests.sh before this file): setup.sql,
-- supabase-alerts.sql, supabase-admin-helpers.sql, supabase-auth-profiles.sql,
-- supabase-alerts-e1c.sql, supabase-checkins.sql, supabase-telegram.sql,
-- supabase-directory.sql, supabase-delete-account.sql.
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

-- ── 0. Grants: authenticated only — never anon/PUBLIC ──
SELECT test_expect(
  has_function_privilege('authenticated', 'public.delete_own_account()', 'EXECUTE'),
  '0a: authenticated can execute delete_own_account'
);
SELECT test_expect(
  NOT has_function_privilege('anon', 'public.delete_own_account()', 'EXECUTE'),
  '0b: anon CANNOT execute delete_own_account'
);
SELECT test_expect(
  NOT has_function_privilege('public', 'public.delete_own_account()', 'EXECUTE'),
  '0c: PUBLIC has no execute on delete_own_account'
);

-- ── 1. Guarda não-autenticada: sem JWT levanta 'not authenticated' ──
SELECT set_config('request.jwt.claims', '', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.delete_own_account();
    RAISE EXCEPTION 'unreachable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not authenticated' THEN
      RAISE NOTICE 'ok: 1a: unauthenticated call raises not authenticated';
    ELSE
      RAISE EXCEPTION 'ASSERT FAILED: 1a: unexpected error instead of guard: %', SQLERRM;
    END IF;
  END;
END $$;

-- ── 2. Fixtures ──
-- manager  dd...01 — gestor não-admin com fichas no directório
-- admin    dd...02 — admin que verificou ficha e reviu claim
-- plain    dd...03 — utilizador base com dados pessoais + alertas legacy
-- other    dd...04 — utilizador de controlo (nunca é eliminado)
-- admin2   dd...05 — admin fresco para as asserções de is_ventu_admin
INSERT INTO auth.users (id, email) VALUES
  ('dd000000-0000-0000-0000-000000000001', 'del-manager@example.com'),
  ('dd000000-0000-0000-0000-000000000002', 'del-admin@example.com'),
  ('dd000000-0000-0000-0000-000000000003', 'del-plain@example.com'),
  ('dd000000-0000-0000-0000-000000000004', 'del-other@example.com'),
  ('dd000000-0000-0000-0000-000000000005', 'del-admin2@example.com')
ON CONFLICT (id) DO NOTHING;

-- Dados pessoais do plain user (profiles é auto-criada pelo trigger de signup)
INSERT INTO user_favorites (user_id, spot_id) VALUES
  ('dd000000-0000-0000-0000-000000000003', 'moledo')
ON CONFLICT DO NOTHING;
INSERT INTO user_checkins (user_id, spot_id) VALUES
  ('dd000000-0000-0000-0000-000000000003', 'moledo')
ON CONFLICT DO NOTHING;
INSERT INTO user_telegram (user_id, chat_id) VALUES
  ('dd000000-0000-0000-0000-000000000003', 910000001)
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO user_alert_prefs (user_id, email, verify_token) VALUES
  ('dd000000-0000-0000-0000-000000000003', 'del-plain@example.com', 'dddddddd-0000-0000-0000-0000000000a1')
ON CONFLICT (user_id) DO NOTHING;

-- Alertas legacy E1 keyed por email: dois do plain (um com case diferente —
-- a limpeza é case-insensitive) e um de controlo com outro endereço.
INSERT INTO alert_subscriptions (email, spot_slug, sport, verify_token, client_id) VALUES
  ('del-plain@example.com', 'moledo', 'surf', 'dddddddd-0000-0000-0000-0000000000b1', 'client-del-0001'),
  ('Del-Plain@example.com', 'baleal', 'surf', 'dddddddd-0000-0000-0000-0000000000b2', 'client-del-0002'),
  ('del-keeper@example.com', 'moledo', 'surf', 'dddddddd-0000-0000-0000-0000000000b3', 'client-del-0003')
ON CONFLICT (verify_token) DO NOTHING;

-- Fichas do directório — inseridas COMO ADMIN (o insert trigger força
-- verified=false a não-admins). O admin já existe, logo is_ventu_admin()
-- com a verificação de existência passa.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}',
  false
);

-- L1: ficha verificada do manager — email copiado da conta, telefone de negócio
INSERT INTO directory_listings (id, slug, name, kind, lat, lon, owner_user_id, verified, verified_by, email, phone, source)
VALUES ('sub-deltest1', 'escola-deltest1-eltest1', 'Escola Deltest 1', 'surf_school', 38.7, -9.4,
        'dd000000-0000-0000-0000-000000000001', true, 'dd000000-0000-0000-0000-000000000002',
        'del-manager@example.com', '+351910000001', 'submitted')
ON CONFLICT (id) DO NOTHING;

-- L2: rascunho nunca publicado do manager
INSERT INTO directory_listings (id, slug, name, kind, lat, lon, owner_user_id, verified, email, source)
VALUES ('sub-deltest2', 'escola-deltest2-eltest2', 'Escola Deltest 2', 'surf_school', 38.7, -9.4,
        'dd000000-0000-0000-0000-000000000001', false, 'del-manager@example.com', 'submitted')
ON CONFLICT (id) DO NOTHING;

-- L3: ficha verificada de OUTRO utilizador mas com o email da conta do manager
-- (edge: scrub global do email pessoal, ownership intacta)
INSERT INTO directory_listings (id, slug, name, kind, lat, lon, owner_user_id, verified, email, source)
VALUES ('sub-deltest3', 'escola-deltest3-eltest3', 'Escola Deltest 3', 'surf_school', 38.7, -9.4,
        'dd000000-0000-0000-0000-000000000004', true, 'del-manager@example.com', 'submitted')
ON CONFLICT (id) DO NOTHING;

-- L4: controlo — ficha verificada de outro utilizador com email de negócio próprio
INSERT INTO directory_listings (id, slug, name, kind, lat, lon, owner_user_id, verified, email, source)
VALUES ('sub-deltest4', 'escola-deltest4-eltest4', 'Escola Deltest 4', 'surf_school', 38.7, -9.4,
        'dd000000-0000-0000-0000-000000000004', true, 'business-other@example.com', 'submitted')
ON CONFLICT (id) DO NOTHING;

-- Perfis: P1 da ficha verificada do manager, P2 do rascunho
INSERT INTO directory_profiles (entry_id, owner_user_id, email, display_name) VALUES
  ('sub-deltest1', 'dd000000-0000-0000-0000-000000000001', 'del-manager@example.com', 'Escola Deltest 1'),
  ('sub-deltest2', 'dd000000-0000-0000-0000-000000000001', 'del-manager@example.com', 'Escola Deltest 2')
ON CONFLICT (entry_id) DO NOTHING;

-- Claims: uma do manager (cascateia com a conta) e uma do other revista pelo admin
INSERT INTO directory_claims (entry_id, user_id, contact_email, status) VALUES
  ('sub-deltest1', 'dd000000-0000-0000-0000-000000000001', 'del-manager@example.com', 'pending')
ON CONFLICT (entry_id, user_id) DO NOTHING;
INSERT INTO directory_claims (entry_id, user_id, contact_email, status, reviewed_by, reviewed_at) VALUES
  ('sub-deltest4', 'dd000000-0000-0000-0000-000000000004', 'del-other@example.com', 'approved',
   'dd000000-0000-0000-0000-000000000002', now())
ON CONFLICT (entry_id, user_id) DO NOTHING;

SELECT set_config('request.jwt.claims', '', false);

-- ── 3. Utilizador base: cascata total + alertas legacy por email ──
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-0000-0000-000000000003","role":"authenticated"}',
  false
);
SET ROLE authenticated;
SELECT public.delete_own_account();
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'dd000000-0000-0000-0000-000000000003'),
  '3a: auth.users row do plain user eliminada'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM profiles WHERE id = 'dd000000-0000-0000-0000-000000000003'),
  '3b: profile cascateou'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM user_favorites WHERE user_id = 'dd000000-0000-0000-0000-000000000003'),
  '3c: favoritos cascatearam'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM user_checkins WHERE user_id = 'dd000000-0000-0000-0000-000000000003'),
  '3d: check-ins (passaporte) cascatearam'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM user_telegram WHERE user_id = 'dd000000-0000-0000-0000-000000000003'),
  '3e: ligação telegram cascateou'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM user_alert_prefs WHERE user_id = 'dd000000-0000-0000-0000-000000000003'),
  '3f: alert prefs E1c cascatearam'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM alert_subscriptions WHERE lower(email) = lower('del-plain@example.com')),
  '3g: alertas legacy E1 com o email da conta eliminados (case-insensitive)'
);
SELECT test_expect(
  EXISTS (SELECT 1 FROM alert_subscriptions WHERE email = 'del-keeper@example.com'),
  '3h: alerta legacy de outro endereço sobrevive (controlo)'
);

-- ── 4. Gestor não-admin: directório órfão+scrub, rascunho apagado ──
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);
SET ROLE authenticated;
SELECT public.delete_own_account();
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'dd000000-0000-0000-0000-000000000001'),
  '4a: auth.users row do manager eliminada'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM directory_listings WHERE id = 'sub-deltest2'),
  '4b: rascunho nunca publicado é apagado com a conta'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM directory_profiles WHERE entry_id = 'sub-deltest2'),
  '4c: perfil do rascunho também é apagado'
);
SELECT test_expect(
  (SELECT owner_user_id IS NULL AND verified
   FROM directory_listings WHERE id = 'sub-deltest1'),
  '4d: ficha verificada sobrevive órfã (owner NULL) e continua verificada'
);
SELECT test_expect(
  (SELECT email IS NULL FROM directory_listings WHERE id = 'sub-deltest1'),
  '4e: email da conta scrubbed na ficha verificada'
);
SELECT test_expect(
  (SELECT phone = '+351910000001' FROM directory_listings WHERE id = 'sub-deltest1'),
  '4f: telefone de negócio (fornecido deliberadamente) fica intacto'
);
SELECT test_expect(
  (SELECT owner_user_id IS NULL AND email IS NULL
   FROM directory_profiles WHERE entry_id = 'sub-deltest1'),
  '4g: perfil da ficha verificada órfão e sem email da conta'
);
SELECT test_expect(
  (SELECT email IS NULL AND owner_user_id = 'dd000000-0000-0000-0000-000000000004'
   FROM directory_listings WHERE id = 'sub-deltest3'),
  '4h: scrub global do email pessoal mesmo em ficha de outro dono; ownership alheia intacta'
);
SELECT test_expect(
  (SELECT email = 'business-other@example.com' FROM directory_listings WHERE id = 'sub-deltest4'),
  '4i: email de negócio diferente em ficha de outro dono não é tocado (controlo)'
);
SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM directory_claims WHERE user_id = 'dd000000-0000-0000-0000-000000000001'),
  '4j: claims do manager cascatearam com a conta'
);
SELECT test_expect(
  NOT EXISTS (
    SELECT 1 FROM directory_listings WHERE owner_user_id = 'dd000000-0000-0000-0000-000000000001'
  ) AND NOT EXISTS (
    SELECT 1 FROM directory_profiles WHERE owner_user_id = 'dd000000-0000-0000-0000-000000000001'
  ),
  '4k: nenhuma referência de ownership ao utilizador eliminado sobrevive (achado 2)'
);

-- ── 5. Admin que moderou: o delete NÃO pode falhar por FK NO ACTION ──
-- Regressão real: sem o null de verified_by/reviewed_by, DELETE de auth.users
-- levantava directory_listings_verified_by_fkey e a eliminação falhava.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"}}',
  false
);
SET ROLE authenticated;
SELECT public.delete_own_account();
RESET ROLE;

SELECT test_expect(
  NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'dd000000-0000-0000-0000-000000000002'),
  '5a: conta de admin eliminada apesar das refs de moderação (sem FK violation)'
);
SELECT test_expect(
  (SELECT verified_by IS NULL FROM directory_listings WHERE id = 'sub-deltest1'),
  '5b: verified_by nulled na ficha que o admin verificou'
);
SELECT test_expect(
  (SELECT reviewed_by IS NULL FROM directory_claims
   WHERE entry_id = 'sub-deltest4' AND user_id = 'dd000000-0000-0000-0000-000000000004'),
  '5c: reviewed_by nulled na claim revista pelo admin'
);

-- ── 5d. ACHADO 1: o JWT do admin eliminado deixa de dar acesso administrativo ──
-- Os claims continuam na sessão (o token ainda não expirou) mas a conta já
-- não existe — is_ventu_admin() tem de ser false.
SELECT test_expect(
  NOT public.is_ventu_admin(),
  '5d: JWT de admin com conta eliminada já não é admin (achado 1)'
);
SELECT set_config('request.jwt.claims', '', false);

-- ── 6. is_ventu_admin: matriz de existência de conta ──
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"role":"admin"}}',
  false
);
SELECT test_expect(
  public.is_ventu_admin(),
  '6a: admin com conta existente continua admin (sem regressão)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-0000-0000-000000000099","role":"authenticated","app_metadata":{"role":"admin"}}',
  false
);
SELECT test_expect(
  NOT public.is_ventu_admin(),
  '6b: claims de admin com sub inexistente não são admin'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","app_metadata":{"role":"admin"}}',
  false
);
SELECT test_expect(
  NOT public.is_ventu_admin(),
  '6c: claims de admin sem sub não são admin'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"dd000000-0000-0000-0000-000000000005","role":"authenticated","app_metadata":{"role":"user"}}',
  false
);
SELECT test_expect(
  NOT public.is_ventu_admin(),
  '6d: utilizador não-admin com conta existente não é admin (controlo)'
);
SELECT set_config('request.jwt.claims', '', false);
