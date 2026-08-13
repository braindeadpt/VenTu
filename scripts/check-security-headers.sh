#!/usr/bin/env bash
# ============================================================
# VenTu — Validate S7 HTTP security headers in production (S7)
#
# Runs the curl checks from docs/SECURITY-HEADERS.md against the live site.
# Intended to be run AFTER the Cloudflare proxy + Transform Rules are applied
# (DNS proxied + 2 rules); against raw GitHub Pages it will (correctly) fail
# every header check — that is the pre-implementation state.
#
# Usage:
#   bash scripts/check-security-headers.sh [BASE_URL]
#   BASE_URL defaults to https://ventu.surf
#
# Exit code: 0 = all checks pass, 1 = at least one check failed.
# ============================================================
set -uo pipefail

BASE="${1:-https://ventu.surf}"
fail=0

status_line() { printf '%s\n' "$1" | head -1 | tr -d '\r'; }

# check_header: header must exist
check_header() { # label, header_name, headers
  local label="$1" name="$2" hdrs="$3"
  if printf '%s\n' "$hdrs" | grep -qiE "^${name}:"; then
    echo "  ok: $label"
  else
    echo "  FAIL: $label — header '$name' ausente ($(status_line "$hdrs"))"
    fail=1
  fi
}

# check_value: header must exist AND match an expected value regex
check_value() { # label, header_name, expected_regex, headers
  local label="$1" name="$2" want="$3" hdrs="$4"
  local line
  line=$(printf '%s\n' "$hdrs" | grep -iE "^${name}:" | head -1 | tr -d '\r')
  if [ -n "$line" ] && printf '%s\n' "$line" | grep -qiE "$want"; then
    echo "  ok: $label"
  else
    echo "  FAIL: $label — ${line:-header '$name' ausente}"
    fail=1
  fi
}

echo "==> $BASE — catch-all (fora de /embed/*)"
h=$(curl -sI "${BASE}/pt/" || true)
check_header "Content-Security-Policy presente"        "Content-Security-Policy"  "$h"
check_value  "frame-ancestors 'none'"                  "Content-Security-Policy"  "frame-ancestors 'none'" "$h"
check_value  "X-Frame-Options: DENY"                   "X-Frame-Options"          "deny" "$h"
check_value  "X-Content-Type-Options: nosniff"         "X-Content-Type-Options"   "nosniff" "$h"
check_value  "Strict-Transport-Security"               "Strict-Transport-Security" "max-age=" "$h"
check_header "Referrer-Policy"                         "Referrer-Policy"          "$h"
if printf '%s\n' "$h" | grep -qi "^Access-Control-Allow-Origin:"; then
  echo "  FAIL: Access-Control-Allow-Origin ainda presente (a Regra 2 deve removê-lo)"
  fail=1
else
  echo "  ok: Access-Control-Allow-Origin removido"
fi

echo "==> $BASE — /embed/* (widget B2B deve continuar iframeable)"
eh=$(curl -sI "${BASE}/embed/spot/moledo/" || true)
check_value "frame-ancestors * em /embed/*" "Content-Security-Policy" "frame-ancestors \*" "$eh"
if printf '%s\n' "$eh" | grep -qi "^X-Frame-Options:"; then
  echo "  FAIL: X-Frame-Options presente em /embed/* — quebra o widget B2B"
  fail=1
else
  echo "  ok: sem X-Frame-Options em /embed/*"
fi

if [ "$fail" -eq 0 ]; then
  echo "OK — headers S7 conforme docs/SECURITY-HEADERS.md"
else
  echo "FALHAS — rever docs/SECURITY-HEADERS.md (proxy Cloudflare + Transform Rules ainda não aplicados?)"
fi
exit "$fail"
