-- ============================================================
-- VenTu — B4: warn flag (alertas de aviso oficiais, independentes do score)
-- Run once in Supabase SQL Editor (after supabase-alerts-e1c-harden.sql).
--
-- `warn = true` → evaluate-alerts dispara email/Telegram quando um
-- favorito tem aviso oficial activo (IPMA laranja/vermelho, aviso IH da
-- faixa §0 — perigo na água, cone de tempestade tropical NHC) mesmo com
-- score abaixo do limiar. Respeita a frequência escolhida (digest/immediate).
--
-- NOTE: a função subscribe_favorites_alerts (5 args, com p_warn) tem a sua
-- definição canónica em supabase-alerts-e1c-harden.sql — o guard de drift
-- impede uma segunda definição public.* aqui. Este ficheiro só garante a
-- coluna warn, por isso pode ser aplicado em qualquer ordem.
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. warn column (opt-in — existing prefs keep warn=false) ──
ALTER TABLE user_alert_prefs
  ADD COLUMN IF NOT EXISTS warn BOOLEAN NOT NULL DEFAULT false;
