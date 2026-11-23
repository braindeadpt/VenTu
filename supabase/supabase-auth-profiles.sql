-- ============================================================
-- VenTu — User accounts + synced favorites (F1)
-- Run in Supabase SQL Editor after supabase-alerts.sql AND
-- supabase-admin-helpers.sql (is_ventu_admin — prerequisite below).
-- Auth: Supabase magic link (configure redirect URLs in dashboard)
-- ============================================================

-- ── Profiles (extends auth.users) ──
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locale TEXT NOT NULL DEFAULT 'pt',
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON profiles;
CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── Favorites (server-side, requires login) ──
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spot_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, spot_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own favorites" ON user_favorites;
CREATE POLICY "Users read own favorites" ON user_favorites
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own favorites" ON user_favorites;
CREATE POLICY "Users insert own favorites" ON user_favorites
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND length(spot_id) >= 1);

DROP POLICY IF EXISTS "Users delete own favorites" ON user_favorites;
CREATE POLICY "Users delete own favorites" ON user_favorites
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, locale)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'locale'), ''), 'pt')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 0. Prerequisite guard (fail at apply time, not on first update) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_ventu_admin'
  ) THEN
    RAISE EXCEPTION 'is_ventu_admin() missing — apply supabase/supabase-admin-helpers.sql first (see supabase/README.md)';
  END IF;
END
$$;

-- ── Privilege lockdown (#454): plan is admin-only ──
-- `plan` controls Pro entitlements: with a blanket UPDATE grant, any signed-in
-- user could grant themselves 'pro' via PostgREST. The column grant covers
-- direct table writes (only `locale` is user-editable); the trigger covers
-- privileged paths (SECURITY DEFINER callers, future RPCs) for non-admins.
REVOKE UPDATE ON profiles FROM authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (locale) ON profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_protect_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_ventu_admin() THEN
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_plan ON profiles;
CREATE TRIGGER profiles_protect_plan
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_protect_plan();

GRANT SELECT, INSERT, DELETE ON user_favorites TO authenticated;
