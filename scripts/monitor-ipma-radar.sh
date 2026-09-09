#!/usr/bin/env bash
# ============================================================
# VenTu — Monitor de saúde do produto radar do IPMA (imgs-radar.json)
#
# Sonda periodicamente o manifest do mosaico continental (workflow
# ih-health.yml, de hora a hora). Considera o produto DEGRADADO quando:
#   - o manifest não responde (HTTP != 200), ou
#   - as slots estão publicadas mas sem ficheiros (todas path:null — o
#     estado observado na outage de 2026-09-08 em diante), ou
#   - o PNG mais recente devolve 404 (paths publicados mas ficheiros
#     ausentes no bucket).
# Quando recupera (manifest com paths válidos + PNG mais recente 200),
# comenta e fecha a issue de incidente automaticamente.
#
# O estado do monitor é a própria issue aberta (label $OUTAGE_LABEL):
# sem state externo — a transição down→up é detectada pela sua presença
# (mesmo padrão do monitor-ih-tides.sh).
#
# Usage:
#   bash scripts/monitor-ipma-radar.sh                          # produção (CI)
#   RADAR_MANIFEST_URL=... bash scripts/monitor-ipma-radar.sh   # override (testes)
#   REPO=user/repo bash scripts/monitor-ipma-radar.sh           # override (testes)
#
# Exit code: 0 sempre — o monitor correu; o estado é reportado por
# issue + log (o aviso é a issue, não o exit code — senão spammava runs
# vermelhos durante uma outage longa, que é exatamente o caso a calar).
# ============================================================
set -uo pipefail

RADAR_MANIFEST_URL="${RADAR_MANIFEST_URL:-https://www.ipma.pt/resources.www/transf/radar/imgs-radar.json}"
FRAME_BASE_URL="${FRAME_BASE_URL:-https://www.ipma.pt/resources.www/transf/radar/por/}"
OUTAGE_LABEL="${OUTAGE_LABEL:-ipma-radar-outage}"
REPO="${REPO:-${GITHUB_REPOSITORY:-braindeadpt/VenTu}}"
BODY_FILE="${TMPDIR:-/tmp}/ipma-radar-body.json"
MANIFEST_CODE="000"
PNG_CODE="000"
VALID_PATHS=0
NEWEST_DATE=""

# probe: 0 = UP (manifest 200 + frames válidos + PNG mais recente 200),
# 1 = DOWN (qualquer elo partido). Grava $MANIFEST_CODE/$PNG_CODE/
# $VALID_PATHS/$NEWEST_DATE para o diagnóstico.
probe() {
  MANIFEST_CODE=$(curl -sS -m 30 -o "$BODY_FILE" -w '%{http_code}' "$RADAR_MANIFEST_URL" 2>/dev/null) || MANIFEST_CODE="000"
  [ "$MANIFEST_CODE" = "200" ] || return 1

  VALID_PATHS=$(grep -oE '"path":[[:space:]]*"[^"]*\.png"' "$BODY_FILE" 2>/dev/null | wc -l | tr -d ' ')
  NEWEST_DATE=$(grep -oE '"date":[[:space:]]*"[^"]*"' "$BODY_FILE" 2>/dev/null | head -1 | sed 's/"date":[[:space:]]*"//; s/"$//')
  [ "${VALID_PATHS:-0}" -gt 0 ] || return 1

  newest_path=$(grep -oE '"path":[[:space:]]*"[^"]*\.png"' "$BODY_FILE" 2>/dev/null | head -1 | sed 's/"path":[[:space:]]*"//; s/"$//')
  PNG_CODE=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "${FRAME_BASE_URL}${newest_path}" 2>/dev/null) || PNG_CODE="000"
  [ "$PNG_CODE" = "200" ] || return 1
}

gh_available() {
  command -v gh >/dev/null 2>&1 && { [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; }
}

open_issue() {
  gh issue list --repo "$REPO" --label "$OUTAGE_LABEL" --state open --json number \
    --jq '.[0].number // empty' 2>/dev/null || true
}

ensure_label() {
  gh label create "$OUTAGE_LABEL" --repo "$REPO" --force --color b60205 \
    --description "Produto radar IPMA degradado (slots path:null / PNG 404)" >/dev/null 2>&1 || true
}

now_utc() { date -u +"%Y-%m-%d %H:%M UTC"; }

if probe; then
  echo "✅ IPMA radar — UP (manifest $MANIFEST_CODE, $VALID_PATHS frame(s), PNG $PNG_CODE)"
  if gh_available; then
    issue=$(open_issue)
    if [ -n "$issue" ]; then
      gh issue comment "$issue" --repo "$REPO" --body "✅ Produto radar IPMA recuperou — \`imgs-radar.json\` voltou a servir frames PNG (manifest $MANIFEST_CODE, $VALID_PATHS frame(s), PNG $PNG_CODE, $(now_utc)). A fechar o incidente; o próximo run do \`update-data\` volta a publicar frames novos." >/dev/null
      gh issue close "$issue" --repo "$REPO" >/dev/null
      echo "🔔 RECOVERY — incidente #$issue comentado e fechado"
    else
      echo "ℹ️ UP sem incidente aberto — estado normal (sem notificação)"
    fi
  else
    echo "ℹ️ UP — gh/GH_TOKEN indisponível (sem notificação por issue)"
  fi
  exit 0
fi

echo "🔴 IPMA radar — DEGRADED (manifest $MANIFEST_CODE, $VALID_PATHS frame(s) válidos, PNG $PNG_CODE, slot mais recente: ${NEWEST_DATE:-?})"
if gh_available; then
  ensure_label
  issue=$(open_issue)
  if [ -n "$issue" ]; then
    echo "ℹ️ Incidente #$issue já aberto — sem spam"
  else
    if url=$(
      gh issue create --repo "$REPO" --label "$OUTAGE_LABEL" \
        --title "IPMA radar degraded — imgs-radar.json ($(now_utc))" \
        --body "$(cat <<EOF
O produto radar do IPMA está degradado: o manifest \`imgs-radar.json\` não está a servir os frames PNG.

- Manifest: HTTP ${MANIFEST_CODE} · frames válidos: ${VALID_PATHS:-0} · slot mais recente: ${NEWEST_DATE:-—} · PNG mais recente: HTTP ${PNG_CODE}
- O site continua a servir o último frame bom em cache (camada \`radarLayer\` é warn-only no pipeline de dados — os dados essenciais não são afectados).
- Gerido por \`scripts/monitor-ipma-radar.sh\` (workflow \`ih-health.yml\`): será comentado e fechado automaticamente quando o produto recuperar.
EOF
)"
    ); then
      echo "🔔 ALERTA — aberto incidente: $url"
    else
      echo "⚠️ falhou a criar a issue (permissões do GITHUB_TOKEN?)"
    fi
  fi
else
  echo "ℹ️ DOWN — gh/GH_TOKEN indisponível (sem notificação por issue)"
fi
exit 0