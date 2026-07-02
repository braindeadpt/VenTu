-- VenTu — Fix alert_subscriptions permissions for anon (run once in SQL Editor)
-- Symptom: subscribe form fails (often shows as [object Object] in UI)

GRANT USAGE, SELECT ON SEQUENCE alert_subscriptions_id_seq TO anon;
GRANT INSERT, UPDATE ON alert_subscriptions TO anon;
