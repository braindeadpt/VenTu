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
--
-- Account-existence check (PR #593 review): o papel lê-se do JWT, que em
-- Supabase Auth fica válido até expirar mesmo depois de a conta ser eliminada.
-- Sem o EXISTS, um admin que eliminasse a conta (delete_own_account) mantinha
-- acesso administrativo — linhas privadas de contribuições/diretório incluídas
-- — durante a vida restante do token. O lookup é PK-indexado e a função é
-- STABLE/zero-arg, por isso o planner avalia uma vez por query (pseudo
-- constante), não por linha. Todas as referências vão schema-qualificadas —
-- o search_path pinado em `public` é suficiente.

CREATE OR REPLACE FUNCTION public.is_ventu_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_ventu_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ventu_admin() TO authenticated;
