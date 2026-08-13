#!/usr/bin/env bash
# ============================================================
# VenTu — Monitor de saúde do backend de marés IH (tide_obs_nrt/items)
#
# Sonda periodicamente o endpoint de items da OGC API do IH (workflow
# ih-health.yml, de hora a hora). Quando o backend recupera (HTTP 200 +
# JSON com "features"), avisa automaticamente via GitHub Issue: comenta e
# fecha o incidente aberto. Enquanto está em baixo, mantém-se silencioso
# (sem spam de runs vermelhos nem issues duplicadas).
#
# O estado do monitor é a própria issue aberta (label $OUTAGE_LABEL):
# sem state externo — a transição down→up é detectada pela sua presença.
#
# Usage:
#   bash scripts/monitor-ih-tides.sh                       # produção (CI)
#   IH_ITEMS_URL=... bash scripts/monitor-ih-tides.sh      # override (testes)
#   REPO=user/repo bash scripts/monitor-ih-tides.sh        # override (testes)
#
# Exit code: 0 sempre — o monitor correu; o estado é reportado por
# issue + log (exit != 0 aqui só serviria para spammar runs vermelhos
# durante uma outage longa, que é exatamente o caso que queremos calar).
# ============================================================
set -uo pipefail

IH_ITEMS_URL="${IH_ITEMS_URL:-https://api-features.hidrografico.pt/collections/tide_obs_nrt/items?limit=1&f=json}"
OUTAGE_LABEL="${OUTAGE_LABEL:-ih-outage}"
REPO="${GITHUB_REPOSITORY:-braindeadpt/VenTu}"
BODY_FILE="${TMPDIR:-/tmp}/ih-monitor-body.json"
LAST_CODE="000"

# probe: 0 = UP (HTTP 200 + JSON com "features"), 1 = DOWN. Grava $LAST_CODE.
probe() {
  LAST_CODE=$(curl -sS -m 30 -o "$BODY_FILE" -w '%{http_code}' "$IH_ITEMS_URL" 2>/dev/null) || LAST_CODE="000"
  [ "$LAST_CODE" = "200" ] && grep -q '"features"' "$BODY_FILE" 2>/dev/null
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
    --description "Backend de marés IH em baixo" >/dev/null 2>&1 || true
}

now_utc() { date -u +"%Y-%m-%d %H:%M UTC"; }

if probe; then
  echo "✅ tide_obs_nrt/items — UP (HTTP $LAST_CODE, JSON válido)"
  if gh_available; then
    issue=$(open_issue)
    if [ -n "$issue" ]; then
      gh issue comment "$issue" --repo "$REPO" --body "✅ Backend IH recuperou — \`tide_obs_nrt/items\` voltou a devolver HTTP 200 com dados ($(now_utc)). A fechar o incidente; confirmar o fim-a-fim com um run do \`update-data\`." >/dev/null
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

echo "🔴 tide_obs_nrt/items — DOWN (HTTP $LAST_CODE) — backend de marés IH em baixo"
if gh_available; then
  ensure_label
  issue=$(open_issue)
  if [ -n "$issue" ]; then
    echo "ℹ️ Incidente #$issue já aberto — sem spam"
  else
    if url=$(gh issue create --repo "$REPO" --label "$OUTAGE_LABEL" \
      --title "🔴 IH tide backend down — tide_obs_nrt/items ($(now_utc))" \
      --body "O endpoint \`tide_obs_nrt/items\` da OGC API do IH devolve \`HTTP $LAST_CODE\`.\n\n- Receita de recuperação (EDR WKT) e histórico: \`docs/BACKLOG.md\` → \"Marés (IH OGC API)\".\n- Gerido por \`scripts/monitor-ih-tides.sh\` (workflow \`ih-health.yml\`): será comentado e fechado automaticamente quando o backend voltar." 2>/dev/null); then
      echo "🔔 ALERTA — aberto incidente: $url"
    else
      echo "⚠️ falhou a criar a issue (permissões do GITHUB_TOKEN?)"
    fi
  fi
else
  echo "ℹ️ DOWN — gh/GH_TOKEN indisponível (sem notificação por issue)"
fi
exit 0
