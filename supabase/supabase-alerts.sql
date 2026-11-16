-- ============================================================
-- VenTu — Email alert subscriptions (Phase C2)
-- Execute in Supabase SQL Editor
-- Requires: RESEND_API_KEY in GitHub Secrets for evaluate-alerts workflow
-- ============================================================

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  spot_slug TEXT NOT NULL,
  sport TEXT NOT NULL,
  min_score INTEGER NOT NULL DEFAULT 70 CHECK (min_score >= 0 AND min_score <= 100),
  verify_token TEXT NOT NULL UNIQUE,
  verified BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  client_id TEXT NOT NULL,
  locale TEXT DEFAULT 'pt',
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_subs_active
  ON alert_subscriptions(active, verified, spot_slug);

CREATE INDEX IF NOT EXISTS idx_alert_subs_email
  ON alert_subscriptions(email);

ALTER TABLE alert_subscriptions ENABLE ROW LEVEL SECURITY;

-- No direct anonymous INSERT: table writes only via SECURITY DEFINER RPCs
-- (subscribe_alert / verify / unsubscribe). The old client_id-throttled
-- policy let any anonymous client pick verify_token and spam third-party
-- emails whenever INSERT was (re)granted — removed so the base file never
-- re-opens that path.
DROP POLICY IF EXISTS "Allow anonymous alert insert" ON alert_subscriptions;

-- Unsubscribe ONLY via SECURITY DEFINER RPCs (token). No broad anon UPDATE.
DROP POLICY IF EXISTS "Allow anonymous alert unsubscribe" ON alert_subscriptions;

DROP POLICY IF EXISTS "Allow authenticated select alerts" ON alert_subscriptions;
DROP POLICY IF EXISTS "Allow authenticated select own alerts" ON alert_subscriptions;
CREATE POLICY "Allow authenticated select own alerts" ON alert_subscriptions
  FOR SELECT TO authenticated
  USING (
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

-- Verify subscription via token (called from static confirm page)
CREATE OR REPLACE FUNCTION verify_alert_subscription(p_token TEXT)
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

GRANT EXECUTE ON FUNCTION verify_alert_subscription(TEXT) TO anon;

-- Unsubscribe via token
CREATE OR REPLACE FUNCTION unsubscribe_alert(p_token TEXT)
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

GRANT EXECUTE ON FUNCTION unsubscribe_alert(TEXT) TO anon;

-- subscribe_alert lives ONLY in supabase-alerts-harden-legacy.sql (S2).
-- This file used to define an anonymous-writable RPC here whose only rate
-- limit was a client-supplied `client_id` (rotatable by the caller in one
-- line of JS) and whose `verify_token` came from the caller — i.e. anyone
-- could mint unlimited pending rows and make the evaluator relay verification
-- emails to arbitrary addresses. The hardened RPC is per-IP rate limited
-- (supabase-rate-limit-common.sql), generates verify_token server-side, caps
-- pending rows per address and enforces UNIQUE (lower(email), spot_slug, sport)
-- while active.
--
-- Drop the legacy 7-arg signature (client-supplied verify_token) if a stale
-- copy of this file created it, so the weak relay can never survive an
-- out-of-order re-apply. The 6-arg signature is intentionally NOT touched
-- here: it is also the hardened RPC's signature, and dropping it on every
-- re-apply of this base file would break a healthy install.
DROP FUNCTION IF EXISTS public.subscribe_alert(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT);

-- Direct table writes are closed: SECURITY DEFINER RPCs (subscribe_alert,
-- verify_alert_subscription, unsubscribe_alert) are the ONLY write path.
-- Matches the user_alert_prefs E1c pattern (supabase-alerts-e1c-harden.sql).
REVOKE INSERT, UPDATE ON alert_subscriptions FROM anon, authenticated;
REVOKE USAGE, SELECT ON SEQUENCE alert_subscriptions_id_seq FROM anon;
