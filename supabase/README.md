# Supabase — schemas SQL

Run these files once in the [Supabase SQL Editor](https://supabase.com/dashboard) for the VenTu project.

| File | Purpose |
|------|---------|
| [`supabase-rate-limit-common.sql`](supabase-rate-limit-common.sql) | **Shared** per-IP rate-limit primitives (`request_client_ip()` + `check_rate_limit()` + `rate_limit_events` ledger) — single source of truth; apply **FIRST**, before every `*-harden-*.sql` |
| [`supabase-alerts.sql`](supabase-alerts.sql) | Email alert subscriptions (E1 legacy) |
| [`supabase-alerts-harden-legacy.sql`](supabase-alerts-harden-legacy.sql) | Harden E1 legacy subscribe RPC (server token, IP rate limit, dedup) — run after `supabase-alerts.sql` + `supabase-rate-limit-common.sql` |
| [`supabase-alerts-e1c.sql`](supabase-alerts-e1c.sql) | Bulk alerts on favorites (E1c) |
| [`supabase-alerts-e1c-harden.sql`](supabase-alerts-e1c-harden.sql) | Harden E1c alert RPCs (per-IP rate limits via `request.headers`, direct writes on `user_alert_prefs` revoked) — run after `supabase-alerts-e1c.sql` + `supabase-rate-limit-common.sql` |
| [`supabase-auth-profiles.sql`](supabase-auth-profiles.sql) | User accounts + synced favorites (F1) |
| [`supabase-contributions.sql`](supabase-contributions.sql) | Community contributions form |
| [`supabase-contributions-migration-c3.sql`](supabase-contributions-migration-c3.sql) | Migration for contributions schema |
| [`supabase-contributions-harden-rpc.sql`](supabase-contributions-harden-rpc.sql) | Harden anon writes (per-IP rate limit via RPC; direct INSERT revoked) — run after contributions + score-feedback files + `supabase-rate-limit-common.sql` |
| [`supabase-score-feedback.sql`](supabase-score-feedback.sql) | Score calibration feedback |

Setup details: [docs/ALERTS.md](../docs/ALERTS.md), [docs/GITHUB-SETUP.md](../docs/GITHUB-SETUP.md).
