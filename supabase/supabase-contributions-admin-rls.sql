-- ============================================================
-- VenTu — Admin-only contributions moderation (P0)
-- Run in Supabase SQL Editor.
-- ============================================================
-- Problem: any authenticated user could SELECT/UPDATE/DELETE all contributions.
-- Fix: only users with app_metadata.role = 'admin' (set in Auth → Users → raw_app_meta_data).

DROP POLICY IF EXISTS "Allow authenticated select" ON contributions;
DROP POLICY IF EXISTS "Allow authenticated update" ON contributions;
DROP POLICY IF EXISTS "Allow authenticated delete" ON contributions;

-- is_ventu_admin() lives in supabase-admin-helpers.sql (single source of
-- truth, LOW8). Fail fast if applied out of order.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_ventu_admin'
  ) THEN
    RAISE EXCEPTION 'is_ventu_admin() missing — apply supabase/supabase-admin-helpers.sql first (see supabase/README.md)';
  END IF;
END $$;

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
