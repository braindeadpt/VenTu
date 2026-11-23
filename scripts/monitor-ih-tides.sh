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

IH_ITEMS_URL="${IH_ITEMS_URL:-https://ogcapi.hidrografico.pt/collections/tide_obs_nrt/items?limit=1&f=json}"
OUTAGE_LABEL="${OUTAGE_LABEL:-ih-outage}"
REPO="${REPO:-${GITHUB_REPOSITORY:-braindeadpt/VenTu}}"
BODY_FILE="${TMPDIR:-/tmp}/ih-monitor-body.json"
LAST_CODE="000"

# probe: 0 = UP (HTTP 200 + features COM campos de observação), 1 = DOWN.
# Desde 2026-09-08 o items devolve 200 com features só-metadados (sem
# last_sea_surface_height/last_date_time) — HTTP 200 + "features" já não
# prova que a camada está viva; foi exatamente esse estado que deixou o
# pipeline verde durante 41 dias. Grava $LAST_CODE.
probe() {
  LAST_CODE=$(curl -sS -m 30 -o "$BODY_FILE" -w '%{http_code}' "$IH_ITEMS_URL" 2>/dev/null) || LAST_CODE="000"
  [ "$LAST_CODE" = "200" ] && grep -q '"features"' "$BODY_FILE" 2>/dev/null     && grep -Eq '"last_sea_surface_height"|"last_obs"' "$BODY_FILE" 2>/dev/null
}

gh_available() {
  command -v gh >/dev/null 2>&1 && { [ -n "${GH_TOKEN:-}" ] || [ -n "${GITHUB_TOKEN:-}" ]; }
}

# Lista TODAS as issues abertas da label — e falha FECHADA (sem || true):
# o `|| true` antigo devolvia "" numa falha transitória do `gh issue list`
# (rede/5xx/rate-limit) e o ramo DOWN criava uma segunda issue duplicada
# (#225, #292). Na recuperação, fechar só `.[0]` deixava duplicados órfãos —
# `.[].number` permite fechar todas.
list_open_issues() {
  gh issue list --repo "$REPO" --label "$OUTAGE_LABEL" --state open --json number \
    --jq '.[].number // empty'
}

ensure_label() {
  gh label create "$OUTAGE_LABEL" --repo "$REPO" --force --color b60205 \
    --description "Backend de marés IH em baixo" >/dev/null 2>&1 || true
}

now_utc() { date -u +"%Y-%m-%d %H:%M UTC"; }

if probe; then
  echo "✅ tide_obs_nrt/items — UP (HTTP $LAST_CODE, JSON válido)"
  if gh_available; then
    if issues=$(list_open_issues); then
      if [ -n "$issues" ]; then
        for issue in $issues; do
          gh issue comment "$issue" --repo "$REPO" --body "✅ Backend IH recuperou — \`tide_obs_nrt/items\` voltou a devolver HTTP 200 com dados ($(now_utc)). A fechar o incidente; confirmar o fim-a-fim com um run do \`update-data\`." >/dev/null
          gh issue close "$issue" --repo "$REPO" >/dev/null
        done
        echo "🔔 RECOVERY — incidente(s) comentado(s) e fechado(s): $issues"
      else
        echo "ℹ️ UP sem incidente aberto — estado normal (sem notificação)"
      fi
    else
      echo "⚠️ gh issue list falhou — recovery adiado para o próximo run"
    fi
  else
    echo "ℹ️ UP — gh/GH_TOKEN indisponível (sem notificação por issue)"
  fi
  exit 0
fi

echo "🔴 tide_obs_nrt/items — DOWN (HTTP $LAST_CODE) — backend de marés IH em baixo"
if gh_available; then
  ensure_label
  if ! issues=$(list_open_issues); then
    echo "⚠️ gh issue list falhou — abortar sem abrir duplicado"
  elif [ -n "$issues" ]; then
    echo "ℹ️ Incidente(s) já aberto(s) ($issues) — sem spam"
  else
    if url=$(
      gh issue create --repo "$REPO" --label "$OUTAGE_LABEL" \
        --title "IH tide backend down — tide_obs_nrt/items ($(now_utc))" \
        --body "$(cat <<EOF
O endpoint \`tide_obs_nrt/items\` da OGC API do IH devolve \`HTTP ${LAST_CODE}\`.

- Receita de recuperação (EDR WKT) e histórico: \`docs/BACKLOG.md\` → "Marés (IH OGC API)".
- Gerido por \`scripts/monitor-ih-tides.sh\` (workflow \`ih-health.yml\`): será comentado e fechado automaticamente quando o backend voltar.
- Open-Meteo / observações **continuam** (o fetch de marés sai 0 com o ficheiro anterior). Não activar \`IH_EDR_FALLBACK\` enquanto o radius também devolver 500 — primeiro \`npm run ih:validate\`.
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
