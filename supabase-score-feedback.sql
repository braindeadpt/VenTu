-- ============================================================
-- VenTu — Score calibration feedback (Phase C4)
-- Execute in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS score_feedback (
  id SERIAL PRIMARY KEY,
  spot_slug TEXT NOT NULL,
  sport TEXT NOT NULL,
  predicted_score INTEGER NOT NULL CHECK (predicted_score >= 0 AND predicted_score <= 100),
  verdict TEXT NOT NULL CHECK (verdict IN ('better', 'same', 'worse')),
  conditions_snapshot JSONB DEFAULT '{}',
  client_id TEXT NOT NULL,
  locale TEXT DEFAULT 'pt',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_feedback_spot_sport
  ON score_feedback(spot_slug, sport, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_score_feedback_client_created
  ON score_feedback(client_id, created_at DESC);

ALTER TABLE score_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous score feedback insert" ON score_feedback;
CREATE POLICY "Allow anonymous score feedback insert" ON score_feedback
  FOR INSERT TO anon
  WITH CHECK (
    length(spot_slug) >= 1
    AND length(client_id) >= 8
    AND (
      NOT EXISTS (
        SELECT 1 FROM score_feedback sf
        WHERE sf.client_id = score_feedback.client_id
        AND sf.spot_slug = score_feedback.spot_slug
        AND sf.sport = score_feedback.sport
        AND sf.created_at > NOW() - INTERVAL '1 hour'
      )
    )
  );

DROP POLICY IF EXISTS "Allow authenticated select score feedback" ON score_feedback;
CREATE POLICY "Allow authenticated select score feedback" ON score_feedback
  FOR SELECT TO authenticated
  USING (true);
