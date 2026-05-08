-- WindSpot Chat Schema
-- Execute this in your Supabase SQL Editor

-- Enable realtime for the messages table
BEGIN;

-- Messages table (chat per spot)
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_slug TEXT NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries by spot
CREATE INDEX IF NOT EXISTS idx_messages_spot ON messages(spot_slug);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read messages (anonymous chat)
CREATE POLICY "Allow anonymous read" ON messages
  FOR SELECT TO anon, authenticated
  USING (true);

-- Allow anyone to insert messages (anonymous chat)
CREATE POLICY "Allow anonymous insert" ON messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Auto-cleanup old messages (optional - keeps last 24h)
-- Run this as a cron job or use Supabase Edge Function
-- DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours';

COMMIT;

-- Verify setup
SELECT * FROM messages LIMIT 1;
