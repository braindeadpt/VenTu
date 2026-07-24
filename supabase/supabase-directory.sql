-- ============================================================
-- VenTu — Directório: claims (reclamar perfil escola/loja)
-- Execute no SQL Editor do Supabase Dashboard
-- Depende de: is_ventu_admin() (supabase-contributions.sql) ou redefine abaixo
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_ventu_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

REVOKE ALL ON FUNCTION public.is_ventu_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ventu_admin() TO authenticated;

-- Perfis reclamados / overrides (F2 edita estes campos)
CREATE TABLE IF NOT EXISTS directory_profiles (
  entry_id TEXT PRIMARY KEY,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT,
  bio TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  sports TEXT[] DEFAULT '{}',
  spot_ids TEXT[] DEFAULT '{}',
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'featured', 'pro')),
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_directory_profiles_owner
  ON directory_profiles(owner_user_id);

ALTER TABLE directory_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_profiles_public_read" ON directory_profiles;
CREATE POLICY "directory_profiles_public_read" ON directory_profiles
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "directory_profiles_owner_update" ON directory_profiles;
CREATE POLICY "directory_profiles_owner_update" ON directory_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "directory_profiles_admin_all" ON directory_profiles;
CREATE POLICY "directory_profiles_admin_all" ON directory_profiles
  FOR ALL TO authenticated
  USING (public.is_ventu_admin())
  WITH CHECK (public.is_ventu_admin());

-- Pedidos de claim
CREATE TABLE IF NOT EXISTS directory_claims (
  id BIGSERIAL PRIMARY KEY,
  entry_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  evidence TEXT CHECK (evidence IS NULL OR length(evidence) <= 2000),
  contact_email TEXT,
  admin_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_directory_claims_status
  ON directory_claims(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_directory_claims_user
  ON directory_claims(user_id);

ALTER TABLE directory_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_claims_insert_own" ON directory_claims;
CREATE POLICY "directory_claims_insert_own" ON directory_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "directory_claims_select_own" ON directory_claims;
CREATE POLICY "directory_claims_select_own" ON directory_claims
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_ventu_admin());

DROP POLICY IF EXISTS "directory_claims_update_own_pending" ON directory_claims;
CREATE POLICY "directory_claims_update_own_pending" ON directory_claims
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "directory_claims_admin_update" ON directory_claims;
CREATE POLICY "directory_claims_admin_update" ON directory_claims
  FOR UPDATE TO authenticated
  USING (public.is_ventu_admin())
  WITH CHECK (public.is_ventu_admin());

GRANT SELECT ON directory_profiles TO anon, authenticated;
GRANT UPDATE ON directory_profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE ON directory_claims TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE directory_claims_id_seq TO authenticated;
