-- ============================================================
-- VenTu — B4: warn flag (alertas de aviso oficiais, independentes do score)
-- Run once in Supabase SQL Editor (after supabase-alerts-e1c-harden.sql).
--
-- `warn = true` → evaluate-alerts dispara email/Telegram quando um
-- favorito tem aviso oficial activo (IPMA laranja/vermelho, aviso IH da
-- faixa §0 — perigo na água, cone de tempestade tropical NHC) mesmo com
-- score abaixo do limiar. Respeita a frequência escolhida (digest/immediate).
--
-- NOTE: this file redefines subscribe_favorites_alerts with a 5th arg
-- (p_warn). If supabase-alerts-e1c-harden.sql is re-applied AFTER this
-- file, re-apply this file to restore the warn-aware signature.
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. warn column (opt-in — existing prefs keep warn=false) ──
ALTER TABLE user_alert_prefs
  ADD COLUMN IF NOT EXISTS warn BOOLEAN NOT NULL DEFAULT false;

-- ── 2. subscribe_favorites_alerts — hardened body + p_warn ──
-- Drop the 4-arg signature so a 4-param call resolves to the 5-arg
-- function via defaults (PostgREST resolves by name + arity).
DROP FUNCTION IF EXISTS public.subscribe_favorites_alerts(INTEGER, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.subscribe_favorites_alerts(
  p_min_score INTEGER,
  p_sport TEXT,
  p_locale TEXT DEFAULT 'pt',
  p_alert_mode TEXT DEFAULT 'digest',
  p_warn BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ip TEXT := public.request_client_ip();
  v_email TEXT;
  v_count INTEGER;
  v_row user_alert_prefs%ROWTYPE;
  v_mode TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Per-IP: max 10 subscribe attempts / 60 s (authenticated flow, generous)
  IF NOT public.check_rate_limit(v_ip, 'subscribe_favorites_alerts', 10, interval '60 seconds') THEN
    RAISE EXCEPTION 'rate_limit';
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
    -- Per-user secondary (same account / same browser): max 1 / 30 s
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
      warn = COALESCE(p_warn, false),
      active = true,
      client_ip = v_ip,
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
    user_id, email, min_score, sport, verify_token, locale, alert_mode, warn, client_ip
  ) VALUES (
    v_uid,
    lower(trim(v_email)),
    p_min_score,
    p_sport,
    gen_random_uuid()::text,
    COALESCE(NULLIF(trim(p_locale), ''), 'pt'),
    v_mode,
    COALESCE(p_warn, false),
    v_ip
  );

  RETURN jsonb_build_object(
    'ok', true,
    'verified', false,
    'favorite_count', v_count,
    'alert_mode', v_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.subscribe_favorites_alerts(INTEGER, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
