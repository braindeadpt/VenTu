-- ============================================================
-- VenTu — Harden legacy subscribe_alert RPC (S2)
-- Run once in Supabase SQL Editor (after supabase-alerts*.sql).
-- ============================================================
-- The E1 legacy flow (per-spot, anonymous) stays functional but is hardened:
--   1. verify_token is now generated SERVER-SIDE (gen_random_uuid) — the
--      client-supplied token parameter is removed from the signature.
--   2. Per-IP rate limit via current_setting('request.headers') (official
--      Supabase pattern — see docs/guides/api/securing-your-api).
--   3. Secondary per-client rate limit (same browser / NAT) on client_id.
--   4. UNIQUE (email, spot_slug, sport) while ACTIVE — no duplicate subs.
--   5. Cap of 5 ACTIVE UNVERIFIED subs per email — stops verification-email
--      flooding to arbitrary addresses (the S2 spam vector).
--   6. Direct anonymous INSERT/UPDATE on alert_subscriptions is revoked —
--      the hardened RPC becomes the only anon write entry point.
--
-- Prerequisite: supabase-rate-limit-common.sql (shared request_client_ip /
-- check_rate_limit / rate_limit_events ledger) — apply it FIRST.
--
-- Idempotent: safe to re-run. The combined token RPCs used by the current UI
-- (verify_alert_token / unsubscribe_alert_token) are untouched.

-- ── 0. Prerequisite guard (fail at apply time, not on first call) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname IN ('request_client_ip', 'check_rate_limit')
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'prerequisite missing: apply supabase-rate-limit-common.sql first';
  END IF;
END
$$;

-- ── 1. Client IP column (per-IP rate limiting) ──
-- Stored as TEXT: the X-Forwarded-For value is an untrusted string and casting
-- to inet would throw on malformed input, breaking the whole RPC.
ALTER TABLE alert_subscriptions ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- ── 2. Dedup: one ACTIVE subscription per (email, spot_slug, sport) ──
DROP INDEX IF EXISTS idx_alert_subs_unique_active;
CREATE UNIQUE INDEX idx_alert_subs_unique_active
  ON alert_subscriptions (lower(email), spot_slug, sport)
  WHERE active = true;

-- ── 3. Close the direct anon write path (RPC becomes the only entry point) ──
DROP POLICY IF EXISTS "Allow anonymous alert insert" ON alert_subscriptions;
REVOKE INSERT, UPDATE ON alert_subscriptions FROM anon;
REVOKE USAGE, SELECT ON SEQUENCE alert_subscriptions_id_seq FROM anon;

-- ── 4. Drop old subscribe_alert signatures (7-arg and 6-arg, client token) ──
DROP FUNCTION IF EXISTS public.subscribe_alert(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.subscribe_alert(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT);

-- ── 5. Hardened subscribe_alert ──
CREATE OR REPLACE FUNCTION public.subscribe_alert(
  p_email TEXT,
  p_spot_slug TEXT,
  p_sport TEXT,
  p_min_score INTEGER,
  p_client_id TEXT,
  p_locale TEXT DEFAULT 'pt'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(btrim(p_email));
  v_ip TEXT;
  v_unverified INTEGER;
BEGIN
  -- ── Input validation ──
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;
  IF p_min_score < 0 OR p_min_score > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;
  IF length(coalesce(p_spot_slug, '')) < 1 OR length(coalesce(p_spot_slug, '')) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;
  IF length(coalesce(p_sport, '')) < 1 OR length(coalesce(p_sport, '')) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_sport');
  END IF;
  IF length(coalesce(p_client_id, '')) < 8 OR length(p_client_id) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_client');
  END IF;

  -- ── Client IP + per-IP rate limit (shared helpers — supabase-rate-limit-common.sql) ──
  v_ip := public.request_client_ip();
  IF NOT public.check_rate_limit(v_ip, 'subscribe_alert', 5, interval '60 seconds') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit');
  END IF;

  -- ── Per-client rate limit (secondary; shared IP / NAT) ──
  IF EXISTS (
    SELECT 1 FROM alert_subscriptions
    WHERE client_id = p_client_id
      AND created_at > now() - interval '30 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit');
  END IF;

  -- ── Anti-spam: cap active UNVERIFIED subs per email (stops verification-email flood) ──
  SELECT count(*) INTO v_unverified
  FROM alert_subscriptions
  WHERE lower(email) = v_email
    AND verified = false
    AND active = true;
  IF v_unverified >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_pending');
  END IF;

  -- ── Dedup (pre-check; the unique index is the hard guarantee) ──
  IF EXISTS (
    SELECT 1 FROM alert_subscriptions
    WHERE lower(email) = v_email
      AND spot_slug = p_spot_slug
      AND sport = p_sport
      AND active = true
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_exists', true);
  END IF;

  -- ── Insert with server-generated token ──
  BEGIN
    INSERT INTO alert_subscriptions (
      email, spot_slug, sport, min_score, verify_token,
      verified, active, client_id, locale, client_ip
    ) VALUES (
      v_email, p_spot_slug, p_sport, p_min_score,
      gen_random_uuid()::text,
      false, true, p_client_id,
      COALESCE(NULLIF(btrim(p_locale), ''), 'pt'),
      v_ip
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'already_exists', true);
  END;

  RETURN jsonb_build_object('ok', true, 'already_exists', false);
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_alert(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_alert(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO anon;

-- ── 6. Token-guarded legacy RPCs (recreated defensively; server tokens now) ──
CREATE OR REPLACE FUNCTION public.verify_alert_subscription(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE alert_subscriptions
  SET verified = true
  WHERE verify_token = p_token
    AND verified = false
    AND active = true;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_alert_subscription(TEXT) TO anon;

CREATE OR REPLACE FUNCTION public.unsubscribe_alert(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE alert_subscriptions
  SET active = false
  WHERE verify_token = p_token
    AND active = true;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsubscribe_alert(TEXT) TO anon;

-- ── 7. Sanity checks (keep) ──
--   "Allow authenticated select own alerts" on alert_subscriptions (authenticated self-select)
--   verify_alert_token / unsubscribe_alert_token (combined, used by /alerts/confirm|unsubscribe)
--   E1c user_alert_prefs flow (subscribe_favorites_alerts) — unaffected
