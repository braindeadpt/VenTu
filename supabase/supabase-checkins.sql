-- ============================================================
-- VenTu — Spot check-ins (Passaporte VenTu)
-- Run in Supabase SQL Editor after supabase-auth-profiles.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS user_checkins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spot_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, spot_id)
);

CREATE INDEX IF NOT EXISTS idx_user_checkins_user ON user_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_checkins_spot ON user_checkins(spot_id);

ALTER TABLE user_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own checkins" ON user_checkins;
CREATE POLICY "Users read own checkins" ON user_checkins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own checkins" ON user_checkins;
CREATE POLICY "Users insert own checkins" ON user_checkins
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND length(spot_id) >= 1);

DROP POLICY IF EXISTS "Users delete own checkins" ON user_checkins;
CREATE POLICY "Users delete own checkins" ON user_checkins
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON user_checkins TO authenticated;