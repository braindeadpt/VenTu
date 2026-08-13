-- ============================================================
-- VenTu — Shared per-IP rate-limit primitives (S2/S6 pattern)
-- Run FIRST in Supabase SQL Editor — every hardening migration
-- (supabase-alerts-harden-legacy.sql, supabase-contributions-harden-rpc.sql,
-- supabase-alerts-e1c-harden.sql) depends on these.
--
-- Single source of truth for the per-IP rate-limit pattern:
--   * request_client_ip()  — client IP from the first X-Forwarded-For hop
--     (official Supabase pattern: current_setting('request.headers')).
--   * check_rate_limit()   — ledger-based limit (true = allowed, records the
--     event; false = blocked). Ledger never exposed through the API.
--
-- Idempotent: safe to re-run.
-- ============================================================

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

-- ── 2. Client IP helper (first X-Forwarded-For hop) ──
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
