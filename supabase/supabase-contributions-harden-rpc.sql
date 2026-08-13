-- ============================================================
-- VenTu — Harden contributions + score_feedback anon writes
-- Run once in Supabase SQL Editor (after supabase-contributions.sql,
-- supabase-contributions-migration-c3.sql and supabase-score-feedback.sql).
-- ============================================================
-- The anonymous write path for both tables used client_id for rate limiting.
-- client_id is client-generated (crypto.randomUUID) and trivially rotatable,
-- so it was never a real boundary — an attacker could spam the feedback form
-- and skew score calibration. This migration closes direct anon INSERT and
-- routes every write through SECURITY DEFINER RPCs that rate-limit by the
-- real client IP (official Supabase pattern — current_setting('request.headers')).
--
--   1. client_ip stored as TEXT (X-Forwarded-For is untrusted; casting to
--      inet would throw on malformed input and break the whole RPC).
--   2. Per-IP rate limits (the hard boundary) + per-client_id secondary
--      limits (same browser / NAT) + per-IP per-spot limits for calibration.
--   3. Direct anonymous INSERT and sequence access revoked — the RPCs are
--      the only anon write entry points. Admin reads/updates are untouched.
--
-- Idempotent: safe to re-run.

-- ── 1. Client IP columns ──
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS client_ip TEXT;
ALTER TABLE score_feedback ADD COLUMN IF NOT EXISTS client_ip TEXT;

-- ── 2. Indexes for the per-IP rate-limit queries ──
CREATE INDEX IF NOT EXISTS idx_contributions_ip_created
  ON contributions(client_ip, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_score_feedback_ip_created
  ON score_feedback(client_ip, created_at DESC);

-- ── 3. Close the direct anon write path (RPCs become the only entry points) ──
DROP POLICY IF EXISTS "Allow anonymous insert with rate limit" ON contributions;
DROP POLICY IF EXISTS "Allow anonymous insert" ON contributions;
REVOKE INSERT ON contributions FROM anon;
REVOKE USAGE, SELECT ON SEQUENCE contributions_id_seq FROM anon;

DROP POLICY IF EXISTS "Allow anonymous score feedback insert" ON score_feedback;
REVOKE INSERT ON score_feedback FROM anon;
REVOKE USAGE, SELECT ON SEQUENCE score_feedback_id_seq FROM anon;

-- ── 4. submit_contribution ──
CREATE OR REPLACE FUNCTION public.submit_contribution(
  p_type TEXT,
  p_message TEXT,
  p_email TEXT DEFAULT NULL,
  p_locale TEXT DEFAULT 'pt',
  p_client_id TEXT,
  p_spot_slug TEXT DEFAULT NULL,
  p_tip_field TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip TEXT;
  v_attempts INTEGER;
BEGIN
  -- ── Input validation (the table CHECKs stay as the hard backstop) ──
  IF p_type NOT IN ('spot', 'idea', 'bug', 'tip') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;
  IF length(coalesce(p_message, '')) < 1 OR length(coalesce(p_message, '')) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_message');
  END IF;
  IF p_email IS NOT NULL AND p_email <> '' THEN
    IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(p_email) > 254 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
    END IF;
  END IF;
  IF length(coalesce(p_client_id, '')) < 8 OR length(p_client_id) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_client');
  END IF;
  IF p_spot_slug IS NOT NULL AND (length(p_spot_slug) < 1 OR length(p_spot_slug) > 120) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;
  IF p_tip_field IS NOT NULL AND length(p_tip_field) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_tip_field');
  END IF;

  -- ── Client IP from request headers (NULL when unavailable, e.g. SQL editor) ──
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

  -- ── Per-IP rate limit: max 5 submissions / 60 s (hard boundary) ──
  IF v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_attempts
    FROM contributions
    WHERE client_ip = v_ip
      AND created_at > now() - interval '60 seconds';
    IF v_attempts >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limit');
    END IF;
  END IF;

  -- ── Per-client rate limit (secondary; shared IP / NAT) ──
  IF EXISTS (
    SELECT 1 FROM contributions
    WHERE client_id = p_client_id
      AND created_at > now() - interval '30 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit');
  END IF;

  INSERT INTO contributions (
    type, message, email, locale, client_id,
    spot_slug, tip_field, client_ip
  ) VALUES (
    p_type,
    btrim(p_message),
    NULLIF(btrim(coalesce(p_email, '')), ''),
    COALESCE(NULLIF(btrim(p_locale), ''), 'pt'),
    p_client_id,
    NULLIF(btrim(coalesce(p_spot_slug, '')), ''),
    NULLIF(btrim(coalesce(p_tip_field, '')), ''),
    v_ip
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contribution(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contribution(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;

-- ── 5. submit_score_feedback ──
CREATE OR REPLACE FUNCTION public.submit_score_feedback(
  p_spot_slug TEXT,
  p_sport TEXT,
  p_predicted_score INTEGER,
  p_verdict TEXT,
  p_conditions_snapshot JSONB DEFAULT '{}',
  p_client_id TEXT,
  p_locale TEXT DEFAULT 'pt'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip TEXT;
  v_attempts INTEGER;
BEGIN
  -- ── Input validation (table CHECKs stay as the hard backstop) ──
  IF length(coalesce(p_spot_slug, '')) < 1 OR length(p_spot_slug) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_slug');
  END IF;
  IF length(coalesce(p_sport, '')) < 1 OR length(p_sport) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_sport');
  END IF;
  IF p_predicted_score < 0 OR p_predicted_score > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;
  IF p_verdict NOT IN ('better', 'same', 'worse') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_verdict');
  END IF;
  IF length(coalesce(p_client_id, '')) < 8 OR length(p_client_id) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_client');
  END IF;

  -- ── Client IP from request headers (same pattern as submit_contribution) ──
  BEGIN
    v_ip := NULLIF(
      split_part(
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        ',', 1
      ),
      ''
    );
    IF v_ip IS NOT NULL AND (length(v_ip) > 64 OR v_ip !~ '^[0-9A-Fa-f:.]+$') THEN
      v_ip := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  -- ── Per-IP rate limit: max 15 submissions / 60 s (hard boundary) ──
  IF v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_attempts
    FROM score_feedback
    WHERE client_ip = v_ip
      AND created_at > now() - interval '60 seconds';
    IF v_attempts >= 15 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limit');
    END IF;
  END IF;

  -- ── Per-IP per-spot: max 5 / hour (protects calibration quality) ──
  IF v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_attempts
    FROM score_feedback
    WHERE client_ip = v_ip
      AND spot_slug = p_spot_slug
      AND sport = p_sport
      AND created_at > now() - interval '1 hour';
    IF v_attempts >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limit');
    END IF;
  END IF;

  -- ── Per-client per-spot (secondary; same browser / NAT) — mirrors the old policy ──
  IF EXISTS (
    SELECT 1 FROM score_feedback
    WHERE client_id = p_client_id
      AND spot_slug = p_spot_slug
      AND sport = p_sport
      AND created_at > now() - interval '1 hour'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limit');
  END IF;

  INSERT INTO score_feedback (
    spot_slug, sport, predicted_score, verdict,
    conditions_snapshot, client_id, locale, client_ip
  ) VALUES (
    btrim(p_spot_slug),
    btrim(p_sport),
    p_predicted_score,
    p_verdict,
    COALESCE(p_conditions_snapshot, '{}'),
    p_client_id,
    COALESCE(NULLIF(btrim(p_locale), ''), 'pt'),
    v_ip
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_score_feedback(TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_score_feedback(TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, TEXT) TO anon;

-- ── 6. Sanity checks (keep) ──
--   Admin policies on contributions (select/update/delete, is_ventu_admin) — untouched.
--   "Allow authenticated select score feedback" — untouched.
--   apply-contributions.js reads via service-role/admin — unaffected.
