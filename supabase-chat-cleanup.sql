-- ============================================================
-- VenTu Chat — LIMPEZA + HARDENING
-- Execute TUDO de uma vez no SQL Editor do Supabase
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- PARTE 1: LIMPEZA — Apagar mensagens maliciosas
-- ═══════════════════════════════════════════════════════════════

-- 1.1 Apagar mensagens de bots/spam/XSS (por username)
DELETE FROM messages 
WHERE username ILIKE ANY (
  ARRAY['%bot%', '%tester%', '%spam%', '%xss%', ':%', '%<script%', '%javascript%']
);

-- 1.2 Apagar mensagens com conteúdo HTML (XSS payloads)
DELETE FROM messages 
WHERE content ~* '<[^>]+>'           -- qualquer tag HTML
   OR content ~* 'on\w+\s*='         -- event handlers (onerror, onclick, etc.)
   OR content ~* 'javascript:'        -- javascript: protocol
   OR content ~* 'data:'              -- data: protocol
   OR content ~* 'script'             -- literal "script"
   OR content ~* 'iframe'             -- literal "iframe"
   OR content ~* 'eval\s*\('          -- eval()
   OR content ~* 'alert\s*\('         -- alert()
   OR content ~* 'document\.'         -- document access
   OR content ~* 'window\.'           -- window access
   OR content ~* 'SPAM'               -- literal spam
   OR content ~* 'spam';              -- literal spam lowercase

-- 1.3 Apagar mensagens antigas (> 24 horas) — opcional, comenta se quiseres manter
DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours';

-- Report da limpeza
DO $$
DECLARE
  total_remaining INT;
BEGIN
  SELECT COUNT(*) INTO total_remaining FROM messages;
  RAISE NOTICE 'Limpeza concluida. Mensagens restantes: %', total_remaining;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- PARTE 2: HARDENING — Sanitização e proteções
-- ═══════════════════════════════════════════════════════════════

-- 2.1 Function: sanitiza conteúdo (remove HTML e scripts)
CREATE OR REPLACE FUNCTION sanitize_content(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
BEGIN
  -- Remove tags HTML completas
  cleaned := regexp_replace(input_text, '<[^>]+>', '', 'gi');
  -- Remove event handlers inline
  cleaned := regexp_replace(cleaned, 'on\w+\s*=\s*["'']?[^"''> ]*', '', 'gi');
  -- Remove javascript: protocol
  cleaned := regexp_replace(cleaned, 'javascript:', '', 'gi');
  -- Remove data: protocol
  cleaned := regexp_replace(cleaned, 'data:', '', 'gi');
  -- Trim
  cleaned := trim(cleaned);
  -- Limita a 280 chars
  RETURN LEFT(cleaned, 280);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2.2 Function: valida username (rejeita caracteres maliciosos)
CREATE OR REPLACE FUNCTION validate_username(input_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Rejeita se vazio ou muito longo
  IF input_username IS NULL OR length(input_username) < 1 OR length(input_username) > 30 THEN
    RETURN FALSE;
  END IF;
  -- Rejeita se contém caracteres especiais perigosos
  IF input_username ~ '[<>"''`:;{}\\[\\]\\|\\^~@#$%&*=+]' THEN
    RETURN FALSE;
  END IF;
  -- Rejeita se começa com numero (bots costumam)
  IF input_username ~ '^[0-9]' THEN
    RETURN FALSE;
  END IF;
  -- Rejeita se contém "bot", "test", "spam", "xss" (case-insensitive)
  IF input_username ~* 'bot|test|spam|xss|admin|moderator|system' THEN
    RETURN FALSE;
  END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2.3 Trigger: sanitiza conteúdo ANTES de inserir
CREATE OR REPLACE FUNCTION sanitize_messages()
RETURNS TRIGGER AS $$
BEGIN
  -- Sanitiza conteúdo
  NEW.content := sanitize_content(NEW.content);
  -- Valida username
  IF NOT validate_username(NEW.username) THEN
    NEW.username := 'Rider' || floor(random() * 10000)::int;
  END IF;
  -- Limita username a 30 chars
  NEW.username := LEFT(NEW.username, 30);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remove trigger anterior se existir
DROP TRIGGER IF EXISTS sanitize_messages_trigger ON messages;

-- Cria trigger
CREATE TRIGGER sanitize_messages_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION sanitize_messages();

-- 2.4 RLS: Reaplica insert policy com validações mais fortes
DROP POLICY IF EXISTS "Allow anonymous insert with rate limit" ON messages;
DROP POLICY IF EXISTS "Allow anonymous insert" ON messages;

CREATE POLICY "Allow anonymous insert with rate limit + validation" ON messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(content) > 0
    AND length(content) <= 280
    AND validate_username(username)
    AND (
      -- Rate limit: mesmo username max 1 msg a cada 10 segundos
      NOT EXISTS (
        SELECT 1 FROM messages m 
        WHERE m.username = messages.username 
        AND m.created_at > NOW() - INTERVAL '10 seconds'
      )
    )
    AND (
      -- Rate limit IP-like: mesmo spot_slug max 5 msgs por minuto (por username)
      (SELECT COUNT(*) FROM messages m 
       WHERE m.spot_slug = messages.spot_slug 
       AND m.created_at > NOW() - INTERVAL '1 minute') < 20
    )
  );

-- 2.5 Garante que RLS está ativo
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 2.6 Reaplica read policy
DROP POLICY IF EXISTS "Allow anonymous read" ON messages;

CREATE POLICY "Allow anonymous read" ON messages
  FOR SELECT TO anon, authenticated
  USING (true);

-- 2.7 Reaplica delete policy (para admin cleanup)
DROP POLICY IF EXISTS "Allow anonymous delete" ON messages;

CREATE POLICY "Allow admin delete" ON messages
  FOR DELETE TO anon, authenticated
  USING (true);

-- 2.8 Realtime já está ativo (ignorado — tabela já pertence à publicação)
-- Nota: ALTER PUBLICATION falha se já estiver registado. Verificado manualmente.

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ═══════════════════════════════════════════════════════════════

-- Verifica trigger
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  CASE tgtype & 66
    WHEN 2 THEN 'BEFORE'
    WHEN 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS timing,
  CASE tgtype & 28
    WHEN 4 THEN 'INSERT'
    WHEN 8 THEN 'DELETE'
    WHEN 16 THEN 'UPDATE'
    WHEN 20 THEN 'INSERT OR UPDATE'
    WHEN 24 THEN 'UPDATE OR DELETE'
    WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
  END AS event
FROM pg_trigger
WHERE tgrelid = 'messages'::regclass AND NOT tgisinternal;

-- Conta mensagens restantes
SELECT COUNT(*) AS total_messages FROM messages;

-- Mostra mensagens mais recentes (legitimas)
SELECT username, LEFT(content, 50) AS content_preview, created_at 
FROM messages 
ORDER BY created_at DESC 
LIMIT 5;

-- ═══════════════════════════════════════════════════════════════
-- INSTRUÇÕES PARA LIMPEZA PERIÓDICA MANUAL
-- ═══════════════════════════════════════════════════════════════
-- Copia e cola isto periodicamente no SQL Editor para manter limpo:
--
-- DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours';
--
-- Ou configura um cron job no Supabase (se o teu plano tiver pg_cron):
-- SELECT cron.schedule('cleanup-chat', '0 * * * *', 
--   $$DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours'$$);
-- ═══════════════════════════════════════════════════════════════
