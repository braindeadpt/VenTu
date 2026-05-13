-- ============================================================
-- VenTu — Tabela de contribuições (spots, ideias, bugs)
-- Execute isto no SQL Editor do Supabase Dashboard
-- ============================================================

-- Criar tabela
CREATE TABLE IF NOT EXISTS contributions (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('spot', 'idea', 'bug')),
  message TEXT NOT NULL CHECK (length(message) >= 1 AND length(message) <= 2000),
  email TEXT,
  locale TEXT DEFAULT 'pt',
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'done', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para ordenação por data
CREATE INDEX IF NOT EXISTS idx_contributions_created_at 
  ON contributions(created_at DESC);

-- Índice para filtrar por status
CREATE INDEX IF NOT EXISTS idx_contributions_status 
  ON contributions(status);

-- Política RLS: permitir INSERT anónimo (qualquer user pode enviar)
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

-- Política para inserção (qualquer um pode enviar)
CREATE POLICY "Allow anonymous insert" ON contributions
  FOR INSERT TO anon
  WITH CHECK (length(message) >= 1 AND length(message) <= 2000);

-- Política para UPDATE (apenas autenticado - requer Supabase Auth)
-- NOTA: Para ativar, descomenta e implementa Supabase Auth no admin
-- CREATE POLICY "Allow authenticated update" ON contributions
--   FOR UPDATE TO authenticated
--   USING (true)
--   WITH CHECK (true);

-- Política para DELETE (apenas autenticado - requer Supabase Auth)
-- NOTA: Para ativar, descomenta e implementa Supabase Auth no admin
-- CREATE POLICY "Allow authenticated delete" ON contributions
--   FOR DELETE TO authenticated
--   USING (true);

-- ⚠️  ATENÇÃO: O admin actual usa password client-side (NÃO é seguro!)
--   Qualquer pessoa com a password pode fazer update/delete.
--   Para segurança real em produção, implementa Supabase Auth.

-- Opcional: auto-cleanup de itens muito antigos (descomenta se quiseres)
-- DELETE FROM contributions WHERE created_at < now() - interval '90 days';

-- ============================================================
-- Como verificar se funcionou:
-- 1. Vai a Table Editor → contributions
-- 2. Clica em "Insert row" para testar manualmente
-- 3. Vai a /pt/admin/contributions no site para ver tudo
-- ============================================================
