-- ============================================================
-- VenTu — Admin-only contributions moderation (P0)
-- Run in Supabase SQL Editor.
-- ============================================================
-- Problem: any authenticated user could SELECT/UPDATE/DELETE all contributions.
-- Fix: only users with app_metadata.role = 'admin' (set in Auth → Users → raw_app_meta_data).

DROP POLICY IF EXISTS "Allow authenticated select" ON contributions;
DROP POLICY IF EXISTS "Allow authenticated update" ON contributions;
DROP POLICY IF EXISTS "Allow authenticated delete" ON contributions;

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

CREATE POLICY "Allow admin select contributions" ON contributions
  FOR SELECT TO authenticated
  USING (public.is_ventu_admin());

CREATE POLICY "Allow admin update contributions" ON contributions
  FOR UPDATE TO authenticated
  USING (public.is_ventu_admin())
  WITH CHECK (public.is_ventu_admin());

CREATE POLICY "Allow admin delete contributions" ON contributions
  FOR DELETE TO authenticated
  USING (public.is_ventu_admin());

-- ============================================================
-- Setup:
-- 1. Auth → Users → choose admin → App Metadata: { "role": "admin" }
-- 2. Open /pt/admin/contributions/ and sign in with that user
-- ============================================================
