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
  client_id TEXT NOT NULL CHECK (length(client_id) >= 8 AND length(client_id) <= 64),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'done', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migração para instalações existentes (ignora se coluna já existir)
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS client_id TEXT;

-- Índices
CREATE INDEX IF NOT EXISTS idx_contributions_created_at 
  ON contributions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contributions_status 
  ON contributions(status);

CREATE INDEX IF NOT EXISTS idx_contributions_client_created
  ON contributions(client_id, created_at DESC);

-- RLS
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

-- INSERT anónimo com rate limit (formulário público)
DROP POLICY IF EXISTS "Allow anonymous insert" ON contributions;
DROP POLICY IF EXISTS "Allow anonymous insert with rate limit" ON contributions;

CREATE POLICY "Allow anonymous insert with rate limit" ON contributions
  FOR INSERT TO anon
  WITH CHECK (
    length(message) >= 1
    AND length(message) <= 2000
    AND client_id IS NOT NULL
    AND length(client_id) >= 8
    AND length(client_id) <= 64
    AND (
      NOT EXISTS (
        SELECT 1 FROM contributions c
        WHERE c.client_id = contributions.client_id
        AND c.created_at > NOW() - INTERVAL '30 seconds'
      )
    )
  );

-- Admin: only users with app_metadata.role = 'admin'
DROP POLICY IF EXISTS "Allow authenticated select" ON contributions;
DROP POLICY IF EXISTS "Allow authenticated update" ON contributions;
DROP POLICY IF EXISTS "Allow authenticated delete" ON contributions;
DROP POLICY IF EXISTS "Allow admin select contributions" ON contributions;
DROP POLICY IF EXISTS "Allow admin update contributions" ON contributions;
DROP POLICY IF EXISTS "Allow admin delete contributions" ON contributions;

-- is_ventu_admin() lives in supabase-admin-helpers.sql (single source of
-- truth, LOW8). Fail fast if this file is applied out of order instead of
-- creating policies that depend on a missing function.
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
-- Admin setup:
-- 1. Auth → Users → App Metadata: { "role": "admin" }
-- 2. Abrir /pt/admin/contributions/ e entrar com esse user
-- ============================================================
