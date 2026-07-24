-- ============================================================
-- VenTu — Directório: claims + registo novo (não verificado → admin verifica)
-- Execute no SQL Editor do Supabase Dashboard
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

-- Listagens submetidas (aparecem logo; verified = false até admin)
CREATE TABLE IF NOT EXISTS directory_listings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) >= 2 AND length(name) <= 120),
  kind TEXT NOT NULL CHECK (kind IN (
    'surf_school', 'kite_center', 'windsurf', 'shop', 'club', 'rental', 'other'
  )),
  sports TEXT[] NOT NULL DEFAULT '{}',
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN 32 AND 43),
  lon DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -32 AND -5),
  region TEXT,
  region_en TEXT,
  spot_ids TEXT[] NOT NULL DEFAULT '{}',
  website TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  source TEXT NOT NULL DEFAULT 'submitted'
    CHECK (source IN ('submitted', 'claimed', 'curated', 'osm')),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'featured', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migração se a tabela já existir sem tier
ALTER TABLE directory_listings
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';

-- Garantir CHECK (ignora se já existir constraint com outro nome)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'directory_listings_tier_check'
  ) THEN
    ALTER TABLE directory_listings
      ADD CONSTRAINT directory_listings_tier_check
      CHECK (tier IN ('free', 'featured', 'pro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_directory_listings_verified
  ON directory_listings(verified, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_directory_listings_owner
  ON directory_listings(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_directory_listings_slug
  ON directory_listings(slug);
CREATE INDEX IF NOT EXISTS idx_directory_listings_tier
  ON directory_listings(tier);

ALTER TABLE directory_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_listings_public_read" ON directory_listings;
CREATE POLICY "directory_listings_public_read" ON directory_listings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "directory_listings_insert_own" ON directory_listings;
CREATE POLICY "directory_listings_insert_own" ON directory_listings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = owner_user_id
    AND verified = false
    AND source = 'submitted'
    AND tier = 'free'
  );

DROP POLICY IF EXISTS "directory_listings_owner_update" ON directory_listings;
CREATE POLICY "directory_listings_owner_update" ON directory_listings
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id AND verified = false)
  WITH CHECK (auth.uid() = owner_user_id AND verified = false);

DROP POLICY IF EXISTS "directory_listings_admin_all" ON directory_listings;
CREATE POLICY "directory_listings_admin_all" ON directory_listings
  FOR ALL TO authenticated
  USING (public.is_ventu_admin())
  WITH CHECK (public.is_ventu_admin());

GRANT SELECT ON directory_listings TO anon, authenticated;
GRANT INSERT, UPDATE ON directory_listings TO authenticated;

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
