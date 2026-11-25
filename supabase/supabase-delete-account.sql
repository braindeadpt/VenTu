-- ============================================================
-- VenTu — Self-service account deletion
-- Run once in Supabase SQL Editor after supabase-auth-profiles.sql
-- (order relative to the other user-data migrations does not matter).
-- ============================================================
-- Deletes the caller's auth.users row. Every table keyed by user_id carries
-- ON DELETE CASCADE (profiles, favorites, check-ins/passport, alert prefs,
-- Telegram link and directory claims), so the row delete is the single sweep.
-- Directory listings use owner_user_id ON DELETE SET NULL: they survive as
-- orphans because they are public directory content, not personal data.
--
-- No rate limit here: deletion is a rare authenticated action and Supabase
-- Auth already throttles sessions. The function is still locked down as an
-- RPC: executable only by authenticated users, never by anon/PUBLIC.
--
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
