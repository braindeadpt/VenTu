-- ============================================================
-- VenTu — E1b: alert frequency (daily digest vs immediate)
-- Run once in Supabase SQL Editor (after supabase-alerts-e1c.sql)
-- ============================================================

ALTER TABLE user_alert_prefs
  ADD COLUMN IF NOT EXISTS alert_mode TEXT NOT NULL DEFAULT 'digest';

ALTER TABLE user_alert_prefs
  DROP CONSTRAINT IF EXISTS user_alert_prefs_alert_mode_check;

ALTER TABLE user_alert_prefs
  ADD CONSTRAINT user_alert_prefs_alert_mode_check
  CHECK (alert_mode IN ('digest', 'immediate'));

-- Replace 3-arg version from E1c
DROP FUNCTION IF EXISTS subscribe_favorites_alerts(INTEGER, TEXT, TEXT);

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
