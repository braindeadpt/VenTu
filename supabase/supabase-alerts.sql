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

DROP POLICY IF EXISTS "Allow anonymous alert insert" ON alert_subscriptions;
CREATE POLICY "Allow anonymous alert insert" ON alert_subscriptions
  FOR INSERT TO anon
  WITH CHECK (
    length(client_id) >= 8
    AND length(email) >= 5
    AND (
      NOT EXISTS (
        SELECT 1 FROM alert_subscriptions a
        WHERE a.client_id = alert_subscriptions.client_id
        AND a.created_at > NOW() - INTERVAL '30 seconds'
      )
    )
  );

DROP POLICY IF EXISTS "Allow anonymous alert unsubscribe" ON alert_subscriptions;
CREATE POLICY "Allow anonymous alert unsubscribe" ON alert_subscriptions
  FOR UPDATE TO anon
  USING (active = true)
  WITH CHECK (active = false);

DROP POLICY IF EXISTS "Allow authenticated select alerts" ON alert_subscriptions;
CREATE POLICY "Allow authenticated select alerts" ON alert_subscriptions
  FOR SELECT TO authenticated
  USING (true);

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
