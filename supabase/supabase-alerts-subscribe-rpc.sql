-- VenTu — subscribe_alert RPC (run once in SQL Editor if direct insert fails with RLS)
-- Symptom: "Não foi possível guardar. Espera 1 minuto e tenta outra vez."

CREATE OR REPLACE FUNCTION subscribe_alert(
  p_email TEXT,
  p_spot_slug TEXT,
  p_sport TEXT,
  p_min_score INTEGER,
  p_verify_token TEXT,
  p_client_id TEXT,
  p_locale TEXT DEFAULT 'pt'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(p_client_id) < 8 OR length(trim(p_email)) < 5 THEN
    RETURN false;
  END IF;

  IF p_min_score < 0 OR p_min_score > 100 THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM alert_subscriptions
    WHERE client_id = p_client_id
      AND created_at > NOW() - INTERVAL '30 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limit';
  END IF;

  INSERT INTO alert_subscriptions (
    email, spot_slug, sport, min_score, verify_token,
    verified, active, client_id, locale
  ) VALUES (
    lower(trim(p_email)), p_spot_slug, p_sport, p_min_score, p_verify_token,
    false, true, p_client_id, COALESCE(NULLIF(trim(p_locale), ''), 'pt')
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION subscribe_alert(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT) TO anon;
