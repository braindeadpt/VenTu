-- ============================================================
-- VenTu — Harden E1c alert RPCs (per-IP rate limits, close direct writes)
-- Run once in Supabase SQL Editor (after supabase-alerts-e1c.sql).
-- ============================================================
-- E1c (user_alert_prefs) writes already go through authenticated RPCs, but:
--   1. The rate limit was per-USER (updated_at 30s) — an attacker with
--      multiple accounts could flood verification emails; no per-IP boundary.
--   2. The token RPCs (verify/unsubscribe, anon) had no rate limit at all.
--   3. Supabase default grants give anon/authenticated INSERT/UPDATE/DELETE
--      on public tables — only RLS (no write policies) was in the way.
--
-- This migration (S2/S6 pattern):
--   * per-IP rate limits on ALL E1c RPCs via current_setting('request.headers')
--   * a rate_limit_events ledger never exposed through the API
--   * direct INSERT/UPDATE/DELETE on user_alert_prefs revoked — the RPCs are
--     the only write paths (defense in depth even if RLS regresses).
--
-- Idempotent: safe to re-run.

-- ── 1. Per-IP rate-limit ledger (never exposed via the API) ──
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  client_ip TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_ip_action_time
  ON rate_limit_events(client_ip, action, created_at DESC);

ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY; -- no policies: API cannot touch it
REVOKE ALL ON rate_limit_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE rate_limit_events_id_seq FROM anon, authenticated;

-- ── 2. Client IP helper (same pattern as S2: first X-Forwarded-For hop) ──
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_ip TEXT;
BEGIN
  BEGIN
    v_ip := NULLIF(
      split_part(
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        ',', 1
      ),
      ''
    );
    -- Keep only plausible IP-ish strings; never trust the value for anything else.
    IF v_ip IS NOT NULL AND (length(v_ip) > 64 OR v_ip !~ '^[0-9A-Fa-f:.]+$') THEN
      v_ip := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;
  RETURN v_ip;
END;
$$;

REVOKE ALL ON FUNCTION public.request_client_ip() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_client_ip() TO anon, authenticated;

-- ── 3. Rate-limit helper: true = allowed (records the event); false = blocked ──
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip TEXT,
  p_action TEXT,
  p_max INTEGER,
  p_window INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  -- IP unavailable (e.g. SQL editor) → fail open: never block legit traffic
  -- on a missing header.
  IF p_ip IS NULL THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_count
  FROM rate_limit_events
  WHERE client_ip = p_ip
    AND action = p_action
    AND created_at > now() - p_window;

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_events (client_ip, action) VALUES (p_ip, p_action);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTERVAL) TO anon, authenticated;

-- ── 4. Close direct writes on user_alert_prefs (RPCs are the only write path) ──
ALTER TABLE user_alert_prefs ADD COLUMN IF NOT EXISTS client_ip TEXT;
REVOKE INSERT, UPDATE, DELETE ON user_alert_prefs FROM anon, authenticated;

-- ── 5. Hardened subscribe_favorites_alerts (per-IP + keeps per-user 30s) ──
CREATE OR REPLACE FUNCTION public.subscribe_favorites_alerts(
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
    user_id, email, min_score, sport, verify_token, locale, alert_mode, client_ip
  ) VALUES (
    v_uid,
    lower(trim(v_email)),
    p_min_score,
    p_sport,
    gen_random_uuid()::text,
    COALESCE(NULLIF(trim(p_locale), ''), 'pt'),
    v_mode,
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

-- ── 6. Token RPCs (anon): per-IP rate limit (brute-force / abuse guard) ──
CREATE OR REPLACE FUNCTION public.verify_user_alerts(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ip TEXT := public.request_client_ip();
BEGIN
  IF NOT public.check_rate_limit(v_ip, 'verify_user_alerts', 30, interval '60 seconds') THEN
    RAISE EXCEPTION 'rate_limit';
  END IF;

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

CREATE OR REPLACE FUNCTION public.unsubscribe_user_alerts(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ip TEXT := public.request_client_ip();
BEGIN
  IF NOT public.check_rate_limit(v_ip, 'unsubscribe_user_alerts', 30, interval '60 seconds') THEN
    RAISE EXCEPTION 'rate_limit';
  END IF;

  UPDATE user_alert_prefs
  SET active = false, updated_at = now()
  WHERE verify_token = p_token
    AND active = true;
  RETURN FOUND;
END;
$$;

-- ── 7. deactivate_user_alerts (authenticated): per-IP rate limit ──
CREATE OR REPLACE FUNCTION public.deactivate_user_alerts()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ip TEXT := public.request_client_ip();
BEGIN
  IF NOT public.check_rate_limit(v_ip, 'deactivate_user_alerts', 10, interval '60 seconds') THEN
    RAISE EXCEPTION 'rate_limit';
  END IF;

  UPDATE user_alert_prefs
  SET active = false, updated_at = now()
  WHERE user_id = auth.uid()
    AND active = true;
  RETURN FOUND;
END;
$$;

-- ── 8. Sanity checks (keep) ──
--   "Users read own alert prefs" SELECT policy — untouched (authenticated self-read).
--   verify_alert_token / unsubscribe_alert_token (combined E1c → E1 legacy) — untouched,
--   now rate-limited per IP via the verify/unsubscribe sub-calls above.
