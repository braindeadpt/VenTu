-- ============================================================
-- VenTu — Shared per-IP rate-limit primitives (S2/S6 pattern)
-- Run FIRST in Supabase SQL Editor — every hardening migration
-- (supabase-alerts-harden-legacy.sql, supabase-contributions-harden-rpc.sql,
-- supabase-alerts-e1c-harden.sql) depends on these.
--
-- Single source of truth for the per-IP rate-limit pattern:
--   * request_client_ip()  — client IP, in order of trust:
--       1. cf-connecting-ip (set by Cloudflare at the edge);
--       2. the LAST hop of x-forwarded-for (appended by our proxy — the FIRST
--          hop is client-controlled and was the #454 rate-limit bypass);
--     validated as IPv4/IPv6. An HTTP request without a usable IP gets the
--     shared 'unknown-http' bucket, never NULL (NULL used to fail open).
--     NULL is returned only when there is no request context at all
--     (SQL Editor / psql), where the caller has no IP to be limited by.
--   * check_rate_limit()   — ledger-based limit (true = allowed, records the
--     event; false = blocked). Ledger never exposed through the API.
--
-- Both helpers are internal: EXECUTE is revoked from PUBLIC, anon and
-- authenticated (they are not PostgREST endpoints). Callers keep working
-- because every caller is SECURITY DEFINER and therefore executes them as the
-- owner — a new caller must be SECURITY DEFINER too.
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

-- ── 2. Client IP helper (edge-set headers only) ──
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers TEXT;
  v_raw TEXT;
BEGIN
  v_headers := current_setting('request.headers', true);

  -- No request context at all (SQL Editor / psql): keep NULL so backfills and
  -- manual work are not blocked. An HTTP request always lands further down.
  IF v_headers IS NULL OR btrim(v_headers) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- Cloudflare overwrites cf-connecting-ip at the edge. The x-forwarded-for
    -- list is append-only, so only its LAST element was written by our proxy;
    -- the first is whatever the client sent (the old bypass, #454).
    v_raw := NULLIF(btrim(COALESCE(v_headers::json ->> 'cf-connecting-ip', '')), '');
    IF v_raw IS NULL THEN
      v_raw := NULLIF(
        btrim(split_part(COALESCE(v_headers::json ->> 'x-forwarded-for', ''), ',', -1)),
        ''
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_raw := NULL;
  END;

  -- Garbage, a CIDR or an over-long value: one shared bucket, never a fresh
  -- key per request and never NULL (either would hand back the fail-open).
  IF v_raw IS NULL
     OR length(v_raw) > 64
     OR position('/' IN v_raw) > 0
     OR v_raw !~ '^[0-9A-Fa-f:.]+$' THEN
    RETURN 'unknown-http';
  END IF;

  -- Real IPv4/IPv6 validation (inet rejects anything else); host() drops any
  -- mask and normalises IPv4-mapped IPv6.
  BEGIN
    RETURN host(v_raw::inet);
  EXCEPTION WHEN OTHERS THEN
    RETURN 'unknown-http';
  END;
END;
$$;

-- Internal helper: not callable through PostgREST (/rpc/request_client_ip).
REVOKE ALL ON FUNCTION public.request_client_ip() FROM PUBLIC, anon, authenticated;

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

-- Internal helper: not callable through PostgREST (/rpc/check_rate_limit).
-- Granting it to anon would let anyone burn another IP's bucket or fill the
-- ledger; every caller is SECURITY DEFINER (see the header).
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTERVAL)
  FROM PUBLIC, anon, authenticated;
