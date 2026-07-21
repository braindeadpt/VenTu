-- ============================================================
-- VenTu — E1c: bulk email alerts on user favorites
-- Run once in Supabase SQL Editor (after supabase-auth-profiles.sql)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_alert_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  min_score INTEGER NOT NULL DEFAULT 70 CHECK (min_score >= 0 AND min_score <= 100),
  sport TEXT NOT NULL DEFAULT 'kitesurf',
  verify_token TEXT NOT NULL UNIQUE,
  verified BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  locale TEXT DEFAULT 'pt',
  alert_mode TEXT NOT NULL DEFAULT 'digest' CHECK (alert_mode IN ('digest', 'immediate')),
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_alert_prefs_active
  ON user_alert_prefs(active, verified);

ALTER TABLE user_alert_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own alert prefs" ON user_alert_prefs;
CREATE POLICY "Users read own alert prefs" ON user_alert_prefs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Subscribe / update alerts for all current favorites (authenticated)
CREATE OR REPLACE FUNCTION subscribe_favorites_alerts(
  p_min_score INTEGER,
  p_sport TEXT,
  p_locale TEXT DEFAULT 'pt',
  p_alert_mode TEXT DEFAULT 'digest'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_count INTEGER;
  v_row user_alert_prefs%ROWTYPE;
  v_mode TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_min_score < 0 OR p_min_score > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  v_mode := lower(trim(COALESCE(p_alert_mode, 'digest')));
  IF v_mode NOT IN ('digest', 'immediate') THEN
    v_mode := 'digest';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR length(trim(v_email)) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_email');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count FROM user_favorites WHERE user_id = v_uid;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_favorites');
  END IF;

  SELECT * INTO v_row FROM user_alert_prefs WHERE user_id = v_uid;

  IF v_row.user_id IS NOT NULL THEN
    IF v_row.updated_at > NOW() - INTERVAL '30 seconds' THEN
      RAISE EXCEPTION 'rate_limit';
    END IF;

    UPDATE user_alert_prefs
    SET
      email = lower(trim(v_email)),
      min_score = p_min_score,
      sport = p_sport,
      locale = COALESCE(NULLIF(trim(p_locale), ''), 'pt'),
      alert_mode = v_mode,
      active = true,
      updated_at = now()
    WHERE user_id = v_uid;

    RETURN jsonb_build_object(
      'ok', true,
      'verified', v_row.verified,
      'favorite_count', v_count,
      'alert_mode', v_mode
    );
  END IF;

  INSERT INTO user_alert_prefs (
    user_id, email, min_score, sport, verify_token, locale, alert_mode
  ) VALUES (
    v_uid,
    lower(trim(v_email)),
    p_min_score,
    p_sport,
    gen_random_uuid()::text,
    COALESCE(NULLIF(trim(p_locale), ''), 'pt'),
    v_mode
  );

  RETURN jsonb_build_object(
    'ok', true,
    'verified', false,
    'favorite_count', v_count,
    'alert_mode', v_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION subscribe_favorites_alerts(INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- Verify E1c subscription (confirm page)
CREATE OR REPLACE FUNCTION verify_user_alerts(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_alert_prefs
  SET verified = true, updated_at = now()
  WHERE verify_token = p_token
    AND verified = false
    AND active = true;
  IF FOUND THEN
    RETURN true;
  END IF;

  -- Idempotent: already-confirmed link still succeeds
  RETURN EXISTS (
    SELECT 1 FROM user_alert_prefs
    WHERE verify_token = p_token
      AND verified = true
      AND active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_user_alerts(TEXT) TO anon;

-- Unsubscribe via email link
CREATE OR REPLACE FUNCTION unsubscribe_user_alerts(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_alert_prefs
  SET active = false, updated_at = now()
  WHERE verify_token = p_token
    AND active = true;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION unsubscribe_user_alerts(TEXT) TO anon;

-- Turn off alerts from account / favorites UI
CREATE OR REPLACE FUNCTION deactivate_user_alerts()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_alert_prefs
  SET active = false, updated_at = now()
  WHERE user_id = auth.uid()
    AND active = true;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION deactivate_user_alerts() TO authenticated;

-- Confirm / unsubscribe: try E1c first, then legacy per-spot (E1)
CREATE OR REPLACE FUNCTION verify_alert_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF verify_user_alerts(p_token) THEN
    RETURN true;
  END IF;

  UPDATE alert_subscriptions
  SET verified = true
  WHERE verify_token = p_token
    AND verified = false
    AND active = true;
  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM alert_subscriptions
    WHERE verify_token = p_token
      AND verified = true
      AND active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_alert_token(TEXT) TO anon;

CREATE OR REPLACE FUNCTION unsubscribe_alert_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF unsubscribe_user_alerts(p_token) THEN
    RETURN true;
  END IF;

  UPDATE alert_subscriptions
  SET active = false
  WHERE verify_token = p_token
    AND active = true;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION unsubscribe_alert_token(TEXT) TO anon;
