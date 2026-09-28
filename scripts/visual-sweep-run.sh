#!/usr/bin/env bash
# Corrida completa do varrimento visual em píxeis, à prova de servidor morto.
#
# Porque existe: o `serve` do `webServer` do Playwright morreu DUAS vezes a meio
# das corridas longas (EMFILE: um ReadStream por pedido que não fecha quando o
# cliente aborta um prefetch), e cada morte corrompeu centenas de capturas com
# `ERR_CONNECTION_REFUSED`. Aqui o servidor é o `visual-sweep-server.mjs` (fecha
# o descritor no `close` da resposta) e um guardião reinicia-o se ainda assim
# cair. As capturas que caírem na janela da morte são apagadas no fim.
#
# Uso: scripts/visual-sweep-run.sh [--workers N] [--port N] [--fresh]
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

WORKERS=3
PORT=4321
FRESH=0
while [ $# -gt 0 ]; do
  case "$1" in
    --workers) WORKERS="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

OUT=_audit/visual-sweep
mkdir -p "$OUT"
LOGS="$OUT/logs"
mkdir -p "$LOGS"

if [ "$FRESH" = "1" ]; then
  rm -rf "$OUT/records" "$OUT/shots"
fi

# As fontes de verdade do artefacto: manifesto (com a impressão digital) e out/.
if [ ! -f "$OUT/manifest.json" ]; then
  node scripts/visual-sweep-manifest.mjs || exit 1
fi

# Limite de descritores: o servidor de testes antigo esgotava o de omissão.
ulimit -n 65535 2>/dev/null || ulimit -n 10240 2>/dev/null || true

echo "[corrida] servidor estático em 127.0.0.1:$PORT (limite de ficheiros: $(ulimit -n))"
node scripts/visual-sweep-server.mjs out "$PORT" >> "$LOGS/server.log" 2>&1 &
SRV=$!
sleep 2
if ! curl -sf -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/pt/index.html"; then
  echo "[corrida] servidor não respondeu — a abortar" >&2
  exit 1
fi

# Guardião: se o servidor cair, volta a subir. Cada morte custa as capturas que
# estiverem a meio (o limpa-falhas no fim repete-as).
(
  while true; do
    sleep 20
    if ! curl -sf -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/pt/index.html"; then
      echo "[guardião] servidor em baixo a $(date -u +%H:%M:%S) — a reiniciar" >> "$LOGS/server.log"
      kill "$SRV" 2>/dev/null
      pkill -f visual-sweep-server 2>/dev/null
      sleep 1
      node scripts/visual-sweep-server.mjs out "$PORT" >> "$LOGS/server.log" 2>&1 &
      SRV=$!
      sleep 2
    fi
  done
) &
GUARD=$!

echo "[corrida] varrimento com $WORKERS workers (VS_RESUME=1) — log em $LOGS/sweep.log"
VS_RESUME=1 VS_WORKERS="$WORKERS" PLAYWRIGHT_PORT="$PORT" \
  npx playwright test --config=playwright.vsweep.config.ts > "$LOGS/sweep.log" 2>&1
EXIT=$?
echo "EXIT=$EXIT" >> "$LOGS/sweep.log"

kill "$GUARD" 2>/dev/null
kill "$SRV" 2>/dev/null
echo "[corrida] terminado com EXIT=$EXIT · $(find "$OUT/records" -name '*.json' 2>/dev/null | wc -l | tr -d ' ') capturas em disco"

# Capturas que caíram na janela de uma morte do servidor: apagadas para a
# próxima passagem as repetir (a análise ignora-as; o relatório precisa de as
# ter em conta como repetidas, não como falhas do produto).
if [ "$EXIT" != "0" ] || [ "$(grep -c 'servidor em baixo' "$LOGS/server.log" 2>/dev/null || echo 0)" -gt 0 ]; then
  echo "[corrida] a verificar capturas com erro de ligação/ficheiro…"
  node scripts/visual-sweep-clean.mjs || true
fi
