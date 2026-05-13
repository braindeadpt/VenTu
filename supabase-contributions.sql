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

-- Política para SELECT (qualquer um pode ver — ou remove se quiseres privado)
-- Se quiseres que só o admin veja, comenta a linha abaixo
CREATE POLICY "Allow anonymous select" ON contributions
  FOR SELECT TO anon
  USING (true);

-- Política para UPDATE (qualquer um pode atualizar status — para a página admin simples)
-- NOTA: Em produção, considera autenticação real. Isto é uma solução simples.
CREATE POLICY "Allow anonymous update" ON contributions
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Política para DELETE (qualquer um pode eliminar — para a página admin)
-- NOTA: Em produção, restringe isto.
CREATE POLICY "Allow anonymous delete" ON contributions
  FOR DELETE TO anon
  USING (true);

-- Opcional: auto-cleanup de itens muito antigos (descomenta se quiseres)
-- DELETE FROM contributions WHERE created_at < now() - interval '90 days';

-- ============================================================
-- Como verificar se funcionou:
-- 1. Vai a Table Editor → contributions
-- 2. Clica em "Insert row" para testar manualmente
-- 3. Vai a /pt/admin/contributions no site para ver tudo
-- ============================================================
