-- ============================================================
-- VenTu — Telegram alerts (MVP): link chat_id to account
-- Run once in Supabase SQL Editor (after auth + E1c)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_telegram (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id BIGINT UNIQUE,
  link_token TEXT UNIQUE,
  link_token_expires TIMESTAMPTZ,
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_telegram_token
  ON user_telegram(link_token)
  WHERE link_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_telegram_chat
  ON user_telegram(chat_id)
  WHERE chat_id IS NOT NULL;

ALTER TABLE user_telegram ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own telegram" ON user_telegram;
CREATE POLICY "Users read own telegram" ON user_telegram
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Offset for Bot API getUpdates (service role only; no user policies)
CREATE TABLE IF NOT EXISTS telegram_bot_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE telegram_bot_state ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated — service role bypasses RLS

-- Create / refresh a short-lived deep-link token (?start=TOKEN)
CREATE OR REPLACE FUNCTION create_telegram_link_token()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_token TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Telegram start payload: max 64 chars
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  INSERT INTO user_telegram (user_id, link_token, link_token_expires, updated_at)
  VALUES (v_uid, v_token, now() + interval '30 minutes', now())
  ON CONFLICT (user_id) DO UPDATE SET
    link_token = EXCLUDED.link_token,
    link_token_expires = EXCLUDED.link_token_expires,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', (now() + interval '30 minutes')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_telegram_link_token() TO authenticated;

CREATE OR REPLACE FUNCTION unlink_telegram()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  DELETE FROM user_telegram WHERE user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION unlink_telegram() TO authenticated;
