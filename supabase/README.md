# Supabase — schemas SQL

Run these files once in the [Supabase SQL Editor](https://supabase.com/dashboard) for the VenTu project.

| File | Purpose |
|------|---------|
| [`supabase-alerts.sql`](supabase-alerts.sql) | Email alert subscriptions (E1 legacy) |
| [`supabase-alerts-harden-legacy.sql`](supabase-alerts-harden-legacy.sql) | Harden E1 legacy subscribe RPC (server token, IP rate limit, dedup) — run after `supabase-alerts.sql` |
| [`supabase-alerts-e1c.sql`](supabase-alerts-e1c.sql) | Bulk alerts on favorites (E1c) |
| [`supabase-auth-profiles.sql`](supabase-auth-profiles.sql) | User accounts + synced favorites (F1) |
| [`supabase-contributions.sql`](supabase-contributions.sql) | Community contributions form |
| [`supabase-contributions-migration-c3.sql`](supabase-contributions-migration-c3.sql) | Migration for contributions schema |
| [`supabase-score-feedback.sql`](supabase-score-feedback.sql) | Score calibration feedback |

Setup details: [docs/ALERTS.md](../docs/ALERTS.md), [docs/GITHUB-SETUP.md](../docs/GITHUB-SETUP.md).
