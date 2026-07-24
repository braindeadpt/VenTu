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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT directory_listings_website_http_check CHECK (
    website IS NULL
    OR website ~* '^https?://'
  )
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

-- Website: só http(s) — bloqueia javascript:/data: (XSS)
-- Corre isolado no SQL Editor se a tabela já existir:
--   ALTER TABLE directory_listings DROP CONSTRAINT IF EXISTS directory_listings_website_http_check;
--   ALTER TABLE directory_listings ADD CONSTRAINT directory_listings_website_http_check
--     CHECK (website IS NULL OR website ~* '^https?://');
--   ALTER TABLE directory_profiles DROP CONSTRAINT IF EXISTS directory_profiles_website_http_check;
--   ALTER TABLE directory_profiles ADD CONSTRAINT directory_profiles_website_http_check
--     CHECK (website IS NULL OR website ~* '^https?://');
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'directory_listings_website_http_check'
  ) THEN
    ALTER TABLE directory_listings
      ADD CONSTRAINT directory_listings_website_http_check
      CHECK (website IS NULL OR website ~* '^https?://');
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

-- Owner can edit after verify; trigger locks admin-only columns
DROP POLICY IF EXISTS "directory_listings_owner_update" ON directory_listings;
CREATE POLICY "directory_listings_owner_update" ON directory_listings
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "directory_listings_admin_all" ON directory_listings;
CREATE POLICY "directory_listings_admin_all" ON directory_listings
  FOR ALL TO authenticated
  USING (public.is_ventu_admin())
  WITH CHECK (public.is_ventu_admin());

CREATE OR REPLACE FUNCTION public.directory_listings_protect_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_ventu_admin() THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.slug := OLD.slug;
  NEW.source := OLD.source;
  NEW.owner_user_id := OLD.owner_user_id;
  NEW.verified := OLD.verified;
  NEW.verified_at := OLD.verified_at;
  NEW.verified_by := OLD.verified_by;
  NEW.tier := OLD.tier;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_directory_listings_protect ON directory_listings;
CREATE TRIGGER trg_directory_listings_protect
  BEFORE UPDATE ON directory_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.directory_listings_protect_admin_fields();

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT directory_profiles_website_http_check CHECK (
    website IS NULL
    OR website ~* '^https?://'
  )
);

CREATE INDEX IF NOT EXISTS idx_directory_profiles_owner
  ON directory_profiles(owner_user_id);

ALTER TABLE directory_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'directory_profiles_website_http_check'
  ) THEN
    ALTER TABLE directory_profiles
      ADD CONSTRAINT directory_profiles_website_http_check
      CHECK (website IS NULL OR website ~* '^https?://');
  END IF;
END $$;

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

CREATE OR REPLACE FUNCTION public.directory_profiles_protect_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_ventu_admin() THEN
    RETURN NEW;
  END IF;
  NEW.entry_id := OLD.entry_id;
  NEW.owner_user_id := OLD.owner_user_id;
  NEW.tier := OLD.tier;
  NEW.verified := OLD.verified;
  NEW.verified_at := OLD.verified_at;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_directory_profiles_protect ON directory_profiles;
CREATE TRIGGER trg_directory_profiles_protect
  BEFORE UPDATE ON directory_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.directory_profiles_protect_admin_fields();

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
GRANT INSERT, UPDATE ON directory_profiles TO authenticated;

GRANT SELECT, INSERT, UPDATE ON directory_claims TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE directory_claims_id_seq TO authenticated;

-- ============================================================
-- Approve claim (atomic): claim + profile + listing (se sub-)
-- Corre isolado no SQL Editor se as tabelas já existirem:
--   (cola a função CREATE OR REPLACE abaixo + REVOKE/GRANT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_directory_claim(
  p_claim_id bigint,
  p_entry_id text,
  p_claimant uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF NOT public.is_ventu_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE directory_claims
  SET
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_claim_id
    AND entry_id = p_entry_id
    AND user_id = p_claimant;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'claim not found or mismatch';
  END IF;

  INSERT INTO directory_profiles (
    entry_id,
    owner_user_id,
    verified,
    verified_at,
    updated_at
  )
  VALUES (
    p_entry_id,
    p_claimant,
    true,
    now(),
    now()
  )
  ON CONFLICT (entry_id) DO UPDATE SET
    owner_user_id = EXCLUDED.owner_user_id,
    verified = true,
    verified_at = EXCLUDED.verified_at,
    updated_at = EXCLUDED.updated_at;

  IF p_entry_id LIKE 'sub-%' THEN
    UPDATE directory_listings
    SET
      owner_user_id = p_claimant,
      verified = true,
      verified_at = now(),
      verified_by = auth.uid(),
      updated_at = now()
    WHERE id = p_entry_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_directory_claim(bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_directory_claim(bigint, text, uuid) TO authenticated;
