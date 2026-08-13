#!/usr/bin/env bash
# ============================================================
# VenTu — Supabase SQL integration tests (hardened subscribe_alert)
#
# Applies setup + the alert migrations to a real Postgres and runs the
# behavior assertions in supabase/tests/test-subscribe-alert.sql.
# The harden migration is applied TWICE to prove idempotency.
#
# Usage (Postgres must be reachable — Docker service in CI, or local):
#   bash supabase/tests/run-tests.sh
#
# Env (all optional, defaults shown):
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=ventu_test
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGDATABASE="${PGDATABASE:-ventu_test}"

# The repo's .sql files use CRLF line endings; psql tolerates \r in most
# places but not inside dollar-quoted bodies — strip it on the fly.
run_sql() {
  sed 's/\r$//' "$1" | psql -v ON_ERROR_STOP=1 -X -q -f -
}

echo "==> setup: roles + auth.jwt() stub"
run_sql supabase/tests/setup.sql

echo "==> applying supabase-rate-limit-common.sql (shared per-IP helpers)"
run_sql supabase/supabase-rate-limit-common.sql
run_sql supabase/supabase-rate-limit-common.sql

echo "==> applying supabase-alerts.sql"
run_sql supabase/supabase-alerts.sql

echo "==> applying supabase-alerts-harden-legacy.sql (1/2)"
run_sql supabase/supabase-alerts-harden-legacy.sql

echo "==> applying supabase-alerts-harden-legacy.sql again (idempotency, 2/2)"
run_sql supabase/supabase-alerts-harden-legacy.sql

echo "==> running subscribe_alert behavior assertions"
run_sql supabase/tests/test-subscribe-alert.sql

echo "==> applying contributions + score-feedback migrations"
run_sql supabase/supabase-contributions.sql
run_sql supabase/supabase-contributions-migration-c3.sql
run_sql supabase/supabase-score-feedback.sql
run_sql supabase/supabase-contributions-harden-rpc.sql

# The hardening file must also apply cleanly twice (idempotency).
run_sql supabase/supabase-contributions-harden-rpc.sql

echo "==> running contributions/tips behavior assertions"
run_sql supabase/tests/test-contributions.sql

echo "==> running score_feedback behavior assertions"
run_sql supabase/tests/test-score-feedback.sql

echo "==> applying E1c alert migrations"
run_sql supabase/supabase-auth-profiles.sql
run_sql supabase/supabase-alerts-e1c.sql
run_sql supabase/supabase-alerts-e1c-harden.sql

# The hardening file must also apply cleanly twice (idempotency).
run_sql supabase/supabase-alerts-e1c-harden.sql

echo "==> running E1c alert behavior assertions"
run_sql supabase/tests/test-e1c.sql

echo "OK — supabase integration tests passed"
