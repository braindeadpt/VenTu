#!/usr/bin/env bash
# ============================================================
# VenTu — Validate S7 HTTP security headers in production (S7)
#
# Runs the curl checks from docs/SECURITY-HEADERS.md against the live site.
# Intended to be run AFTER the Cloudflare proxy + Transform Rules + Cache Rules
# are applied (DNS proxied + 2 transform rules + 3 cache rules C1/C2/C3);
# against raw GitHub Pages it will (correctly) fail every header/cache check
# — that is the pre-implementation state.
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
  local label="$1" name="$2" want="$3" hdrs="$4" line missing
  line=$(printf '%s\n' "$hdrs" | grep -iE "^${name}:" | head -1 | tr -d '\r')
  if [ -n "$line" ] && printf '%s\n' "$line" | grep -qiE "$want"; then
    echo "  ok: $label"
  else
    # SC2016-avoiding form: o $name expande mesmo no default do ${line:-...}
    # (o shellcheck perde-se com as aspas dentro do default — falso positivo).
    missing="header '$name' ausente"
    echo "  FAIL: $label — ${line:-$missing}"
    fail=1
  fi
}

# check_csp_source: directive must contain exact source token (order-independent; rejects partial paths)
check_csp_source() { # label, directive, exact_source, headers
  local label="$1" dir="$2" want="$3" hdrs="$4" val ok
  val=$(printf '%s\n' "$hdrs" | grep -iE '^Content-Security-Policy:' | head -1 | tr -d '\r' | sed -E 's/^[^:]+:[[:space:]]*//')
  ok=$(printf '%s\n' "$val" | awk -v d="$dir" -v w="$want" -F';' '
    {
      for (i = 1; i <= NF; i++) {
        n = split($i, a, /[ \t]+/)
        k = 1
        while (k <= n && a[k] == "") k++
        if (k <= n && tolower(a[k]) == tolower(d)) {
          for (j = k + 1; j <= n; j++) {
            if (a[j] == w) { print "1"; exit }
          }
        }
      }
    }
  ')
  if [ "$ok" = "1" ]; then
    echo "  ok: $label"
  else
    echo "  FAIL: $label — diretiva '${dir}' sem origem exata '${want}'"
    fail=1
  fi
}

echo "==> $BASE — catch-all (fora de /embed/*)"
h=$(curl -sI "${BASE}/pt/" || true)
check_header "Content-Security-Policy presente"        "Content-Security-Policy"  "$h"
check_value  "frame-ancestors 'none'"                  "Content-Security-Policy"  "frame-ancestors 'none'" "$h"
check_csp_source "CSP connect-src permite AWS Terrain Tiles" "connect-src" "https://s3.amazonaws.com" "$h"
check_csp_source "CSP img-src permite EUMETView"             "img-src"     "https://view.eumetsat.int" "$h"
check_csp_source "CSP img-src permite AWS Terrain Tiles"     "img-src"     "https://s3.amazonaws.com" "$h"
check_csp_source "CSP worker-src permite 'self'"             "worker-src"  "'self'" "$h"
check_csp_source "CSP worker-src permite blob:"              "worker-src"  "blob:" "$h"
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

# ── Cache edge (Cache Rules C1/C2/C3 — docs/SECURITY-HEADERS.md §3.3) ──
# Warm-up (1.º GET popula o edge) + 2.º GET a verificar o cf-cache-status.
# Sem cf-cache-status = proxy Cloudflare não aplicado (estado pré-S7).
echo "==> $BASE — cache edge (C1/C2/C3)"

cf_cache_status() { # url → cf-cache-status (ou vazio)
  curl -s -D - -o /dev/null "$1" 2>/dev/null | tr -d '\r' | grep -i "^cf-cache-status:" | head -1 | awk '{print $2}'
}

# check_cache_rule: label, url, expect (HIT|DYNAMIC), allow_empty(0|1)
check_cache_rule() {
  local label="$1" url="$2" expect="$3" allow_empty="${4:-0}" st
  curl -s -o /dev/null "$url" || true # warm-up
  st=$(cf_cache_status "$url")
  if [ "$st" = "$expect" ]; then
    echo "  ok: $label — cf-cache-status: $st"
  elif [ -z "$st" ] && [ "$allow_empty" = "1" ]; then
    echo "  ok: $label — sem cf-cache-status (bypass edge, comportamento esperado)"
  elif [ -z "$st" ]; then
    echo "  FAIL: $label — sem cf-cache-status (proxy Cloudflare não aplicado?)"
    fail=1
  else
    echo "  FAIL: $label — esperado $expect, obtido ${st:-<vazio>}"
    fail=1
  fi
}

# C1 — /_next/static/* (imutável, 1 ano): extrai um asset real do HTML de /pt/
asset=$(curl -s "${BASE}/pt/" 2>/dev/null | grep -oE "/_next/static/[^\"']+\.js" | head -1 || true)
if [ -n "$asset" ]; then
  check_cache_rule "C1 /_next/static/* (${asset}) — HIT" "${BASE}${asset}" "HIT"
else
  echo "  FAIL: C1 — não encontrei asset /_next/static no HTML de ${BASE}/pt/"
  fail=1
fi

# C2 — /data/* (SWR 5 min)
check_cache_rule "C2 /data/news.json — HIT" "${BASE}/data/news.json" "HIT"

# C3 — /sw.js (bypass edge): DYNAMIC ou sem header; HIT/MISS = regra não aplicada
check_cache_rule "C3 /sw.js — DYNAMIC (bypass)" "${BASE}/sw.js" "DYNAMIC" 1

# ── Digital Asset Links (TWA Android — docs/ANDROID.md) ──
# /.well-known/assetlinks.json tem de responder 200 com o package da app:
# o upload-pages-artifact exclui dotfiles por defeito (include-hidden-files
# no deploy.yml) e um 404 aqui faz a TWA abrir com barra de URL.
echo "==> $BASE — Digital Asset Links (TWA)"
al_code=$(curl -s -o /tmp/ventu-assetlinks.json -w '%{http_code}' "${BASE}/.well-known/assetlinks.json" || true)
al_body=$(cat /tmp/ventu-assetlinks.json 2>/dev/null || true)
rm -f /tmp/ventu-assetlinks.json
if [ "$al_code" = "200" ] && printf '%s' "$al_body" | grep -q '"package_name": "surf.ventu.app"'; then
  echo "  ok: assetlinks.json 200 com package surf.ventu.app"
else
  echo "  FAIL: assetlinks.json — HTTP ${al_code:-erro} (esperado 200 + package surf.ventu.app)"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "OK — headers S7 + cache edge + assetlinks conforme docs/SECURITY-HEADERS.md e docs/ANDROID.md"
else
  echo "FALHAS — rever docs/SECURITY-HEADERS.md (proxy Cloudflare + Transform/Cache Rules) e docs/ANDROID.md (assetlinks no ar?)"
fi
exit "$fail"
