-- VenTu — shared admin helper (single source of truth)
--
-- Apply BEFORE any feature file that depends on is_ventu_admin():
-- supabase-contributions.sql, supabase-directory.sql,
-- supabase-contributions-admin-rls.sql.
--
-- LOW8 (auditoria): a função estava copiada verbatim nos 3 ficheiros (3 corpos
-- idênticos, risco de drift conforme a ordem de aplicação). Ficou uma única
-- definição aqui; scripts/check-sql-function-drift.js falha em CI se voltar a
-- aparecer noutro ficheiro. Reaplicar é idempotente (CREATE OR REPLACE).

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
