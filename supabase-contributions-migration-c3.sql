-- Migration for existing contributions table (Phase C3)
-- Run after supabase-contributions.sql

ALTER TABLE contributions ADD COLUMN IF NOT EXISTS spot_slug TEXT;
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS tip_field TEXT;

ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_type_check;
ALTER TABLE contributions ADD CONSTRAINT contributions_type_check
  CHECK (type IN ('spot', 'idea', 'bug', 'tip'));
