-- ============================================================
-- VenTu — Harden alert unsubscribe RLS (P0)
-- Run in Supabase SQL Editor AFTER relying on email alerts in prod.
-- ============================================================
-- Problem: "Allow anonymous alert unsubscribe" let any anon client
-- UPDATE all active rows to inactive (mass unsubscribe).
-- Unsubscribe must go through SECURITY DEFINER RPCs that check tokens.

DROP POLICY IF EXISTS "Allow anonymous alert unsubscribe" ON alert_subscriptions;

-- Authenticated users may only see their own email subscriptions
DROP POLICY IF EXISTS "Allow authenticated select alerts" ON alert_subscriptions;
CREATE POLICY "Allow authenticated select own alerts" ON alert_subscriptions
  FOR SELECT TO authenticated
  USING (
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );

-- Keep token RPCs (already SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION verify_alert_subscription(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION unsubscribe_alert(TEXT) TO anon;
