#!/usr/bin/env bash
# ============================================================
# VenTu — Servidor local do export estático, em sessão destacada
#
# Sobe `out/` (o export do `next build`) numa sessão `screen` que NÃO
# pertence ao processo que a lança. É para isso que existe: quem lança o
# servidor a partir de um comando perde-o quando esse comando termina, e
# nessa altura já não consegue conduzir o site com JS. Com a sessão
# destacada, o servidor sobrevive a quem o lançou.
#
# Uso:
#   bash scripts/serve-preview.sh start [--port 4198] [--json] [--force]
#   bash scripts/serve-preview.sh stop
#   bash scripts/serve-preview.sh restart [--port 4198]
#   bash scripts/serve-preview.sh status [--json]
#   bash scripts/serve-preview.sh pid|url          # só o valor (para register_preview)
#   bash scripts/serve-preview.sh logs [-f]
#
#   PORT=4198 bash scripts/serve-preview.sh start   # porta por env (só no start)
#
# Precedência da porta: --port > porta registada (start: env PORT) > 4198.
# A porta registada ganha em stop/status/pid/url, senão um PORT herdado do
# ambiente mandava o stop à porta errada (medido: este ambiente injecta
# PORT=0 e o stop mirava o vazio, deixando o servidor pendurado).
#
# Sessão/estado (por worktree, para vários coexistirem):
#   sessão screen: ventu-serve-<pasta-do-worktree>
#   estado+log:    ${TMPDIR}/ventu-serve/<pasta-do-worktree>/
#
# Notas de intenção:
#   - `--no-port-switching` é obrigatório: por omissão o `serve` abre
#     OUTRA porta quando a pedida está ocupada, e o URL devolvido passaria
#     a apontar para o sítio errado (falha silenciosa que aparece como
#     "o browser não carrega").
#   - Nada de `-s/--single`: o export tem ficheiros a sério e o fallback
#     SPA esconderia 404s reais (a auditoria de links assenta em 404s).
#   - A propriedade da porta é decidida pelo pid registado, não por
#     heurística: com worktrees a mais, "é um serve out" é verdade para o
#     servidor do vizinho.
#
# Exit code: 0 = ok; 1 = erro (build ausente, porta ocupada por outro, arranque falhado).
# ============================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="$(basename "$ROOT")"
SESSION="ventu-serve-${NAME}"
STATE="${TMPDIR:-/tmp}/ventu-serve/${NAME}"
LOG="${STATE}/serve.log"
PID_FILE="${STATE}/serve.pid"
PORT_FILE="${STATE}/serve.port"
OUT="${ROOT}/out"
ENTRY="${OUT}/pt/index.html"
START_TIMEOUT="${START_TIMEOUT:-25}"

mkdir -p "$STATE"

die() { echo "erro: $*" >&2; exit 1; }
info() { echo "==> $*"; }

OUT_PORT="$(cat "$PORT_FILE" 2>/dev/null || true)"

# ── argumentos ──────────────────────────────────────────────
CMD="${1:-}"; shift 2>/dev/null || true
JSON=0; FORCE=0; FOLLOW=0; FLAG_PORT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) FLAG_PORT="${2:?falta o valor de --port}"; shift 2 ;;
    --port=*) FLAG_PORT="${1#*=}"; shift ;;
    --json) JSON=1; shift ;;
    --force) FORCE=1; shift ;;
    -f|--follow) FOLLOW=1; shift ;;
    -h|--help) CMD="help"; shift ;;
    *) die "argumento desconhecido: $1" ;;
  esac
done
[ -n "$CMD" ] || CMD="help"

ENV_PORT="${PORT:-}"
[ "$ENV_PORT" = "0" ] && ENV_PORT=""   # 0 = "porta à escolha" nalguns sandboxes; o serve não aceita
if [ -n "$FLAG_PORT" ]; then PORT="$FLAG_PORT"
elif [ "$CMD" = "start" ]; then PORT="${ENV_PORT:-${OUT_PORT:-4198}}"
else PORT="${OUT_PORT:-${ENV_PORT:-4198}}"
fi
[[ "$PORT" =~ ^[0-9]+$ ]] || die "--port espera um número, recebi '$PORT'"
[ "$PORT" = "0" ] && die "porta 0 não faz sentido aqui — indica uma concreta (ex.: 4198)"

URL="http://127.0.0.1:${PORT}/pt/"

# ── helpers ─────────────────────────────────────────────────
session_line() { screen -ls 2>/dev/null | grep -E "^[[:space:]]*[0-9]+[.]${SESSION}[[:space:]]" || true; }
session_alive() { [ -n "$(session_line)" ]; }

pid_for_port() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1; }
port_busy() { [ -n "$(pid_for_port)" ]; }

# O pid que NÓS arrancamos nesta porta (é esta a fonte de verdade).
our_pid() {
  local recorded cur
  recorded="$(cat "$PID_FILE" 2>/dev/null || true)"
  [ -n "$recorded" ] || return 0
  cur="$(pid_for_port)"
  [ "$recorded" = "$cur" ] && printf '%s' "$cur"
}

http_code() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$URL" 2>/dev/null || echo "000"; }

# Guarda-costas: se por algum motivo formos matar um processo, confirma que
# é mesmo um `serve out` (nunca matar um processo alheio que apanhou a porta).
is_our_serve() {
  case "$(ps -o command= -p "$1" 2>/dev/null || true)" in
    *serve*out*) return 0 ;;
    *) return 1 ;;
  esac
}

require_screen() {
  command -v screen >/dev/null 2>&1 && return 0
  echo "erro: 'screen' não encontrado. macOS traz o screen; noutros sistemas instala tmux/screen." >&2
  exit 1
}

# ── export: existe e não está velho ─────────────────────────
check_export() {
  [ -d "$OUT" ] || die "não há '$OUT'. Corre 'npm run build' (ou 'npm run build:e2e' para as páginas com Supabase)."
  [ -f "$ENTRY" ] || die "'$ENTRY' não existe — o export não parece completo. Corre 'npm run build'."

  # Auditar um export velho dá achados que já não existem no código (ou
  # esconde os novos): a medir o site, é o erro mais caro de todos porque
  # não se vê. Avisa alto em vez de falhar — pode ser de propósito.
  local fresh n
  fresh="$(find "$ROOT/src" -type f -newer "$ENTRY" 2>/dev/null | head -3)"
  if [ -n "$fresh" ]; then
    n="$(find "$ROOT/src" -type f -newer "$ENTRY" 2>/dev/null | wc -l | tr -d ' ')"
    echo "aviso: 'out/' ($(stat -f '%Sm' "$ENTRY" 2>/dev/null)) está desactualizado — $n ficheiro(s) de src/ são mais recentes:" >&2
    printf '       %s\n' $fresh >&2
    echo "       corre 'npm run build' antes de tirar conclusões visuais ou de layout." >&2
  fi
}

# ── comandos ────────────────────────────────────────────────
cmd_start() {
  require_screen
  check_export

  local own cur
  own="$(our_pid)"; cur="$(pid_for_port)"

  if [ -n "$own" ] && [ "$FORCE" != "1" ]; then
    info "já está a correr (sessão ${SESSION}, pid $own)"
    report
    return 0
  fi

  # Porta ocupada por alguém que não é o nosso pid registado: pode ser outro
  # worktree com o mesmo PORT. Falha alto — nunca partilhar/roubar portas.
  if [ -n "$cur" ] && [ "$cur" != "$own" ]; then
    die "porta $PORT já está ocupada pelo pid $cur ($(ps -o comm= -p "$cur" 2>/dev/null)) — outro worktree?
      usa --port para uma porta livre, ou corre 'stop' a partir desse worktree."
  fi

  # Sessão screen órfã (sem processo a escutar): limpa antes de relançar.
  session_alive && cmd_stop >/dev/null 2>&1
  [ "$FORCE" = "1" ] && [ -n "$cur" ] && cmd_stop >/dev/null 2>&1

  echo "$PORT" > "$PORT_FILE"
  info "a lançar 'serve out' na porta $PORT (sessão ${SESSION})"
  # -n: sem clipboard (sem tty, escrever no clipboard de outro é rude).
  # --no-port-switching: ver nota no topo — o URL tem de ser o prometido.
  screen -dmS "$SESSION" bash -lc "cd $(printf '%q' "$ROOT") && exec npx serve out -l ${PORT} --no-port-switching -n > $(printf '%q' "$LOG") 2>&1" \
    || die "não consegui criar a sessão screen"

  local waited=0 code="000" p=""
  while [ "$waited" -lt "$START_TIMEOUT" ]; do
    code="$(http_code)"; [ "$code" = "200" ] && break
    sleep 1; waited=$((waited + 1))
  done

  p="$(pid_for_port)"
  if [ "$code" != "200" ] || [ -z "$p" ]; then
    echo "--- últimas linhas de $LOG ---" >&2
    tail -n 15 "$LOG" 2>/dev/null >&2
    cmd_stop >/dev/null 2>&1
    die "o servidor não ficou de pé (HTTP $code em ${waited}s)"
  fi

  echo "$p" > "$PID_FILE"
  info "no ar"
  report
}

cmd_stop() {
  if session_alive; then
    info "a encerrar a sessão ${SESSION}"
    screen -S "$SESSION" -X quit >/dev/null 2>&1
  fi

  local own waited=0
  own="$(our_pid)"
  # `screen -X quit` fecha a sessão mas NÃO mata o filho (medido: o node fica a
  # escutar). Como o pid registado é nosso, não vale a pena esperar por ele —
  # dá-se só 1s de cortesia e termina-se.
  if [ -n "$own" ]; then
    while [ "$waited" -lt 1 ] && [ -n "$own" ]; do
      sleep 1; waited=$((waited + 1)); own="$(our_pid)"
    done
    if [ -n "$own" ] && is_our_serve "$own"; then
      info "a terminar o processo pendurado $own"
      kill "$own" 2>/dev/null; sleep 1
      own="$(our_pid)"
      [ -n "$own" ] && kill -9 "$own" 2>/dev/null
    fi
  fi

  local cur; cur="$(pid_for_port)"
  if [ -n "$cur" ]; then
    echo "aviso: a porta $PORT continua ocupada pelo pid $cur — não é o servidor registado deste worktree, não toquei nele." >&2
  fi
  rm -f "$PID_FILE"
  info "parado"
  return 0
}

cmd_status() {
  local own cur code
  own="$(our_pid)"; cur="$(pid_for_port)"; code="$(http_code)"

  if [ "$JSON" = "1" ]; then
    printf '{"session":"%s","running":%s,"port":%s,"pid":%s,"url":"%s","http":"%s"}\n' \
      "$SESSION" "$([ -n "$own" ] && echo true || echo false)" "$PORT" "${own:-null}" "$URL" "$code"
    [ -n "$own" ]
    return
  fi

  if [ -n "$own" ]; then
    info "a correr — sessão ${SESSION}, pid $own, porta $PORT, HTTP $code"
    echo "    URL:   $URL"
    echo "    log:   $LOG"
    echo "    parar: bash scripts/serve-preview.sh stop"
    return 0
  fi
  if [ -n "$cur" ]; then
    info "parado aqui, mas a porta $PORT está ocupada pelo pid $cur (outro worktree?)"
    return 1
  fi
  info "parado (porta $PORT livre)"
  return 1
}

report() {
  local p; p="$(our_pid)"
  if [ "$JSON" = "1" ]; then
    printf '{"url":"%s","pid":%s,"port":%s,"log":"%s"}\n' "$URL" "${p:-null}" "$PORT" "$LOG"
  else
    echo "    URL:   $URL"
    echo "    pid:   ${p:-?}"
    echo "    log:   $LOG"
    echo "    (register_preview: url=$URL pid=${p:-?})"
  fi
}

cmd_logs() {
  [ -f "$LOG" ] || die "sem log em $LOG"
  if [ "$FOLLOW" = "1" ]; then tail -n 50 -f "$LOG"; else tail -n "${LINES:-50}" "$LOG"; fi
}

cmd_help() { sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

case "$CMD" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop >/dev/null 2>&1; cmd_start ;;
  status)  cmd_status ;;
  pid)     p="$(our_pid)"; [ -n "$p" ] || die "não está a correr"; printf '%s\n' "$p" ;;
  url)     printf '%s\n' "$URL" ;;
  logs)    cmd_logs ;;
  help|"") cmd_help ;;
  *)       die "comando desconhecido: $CMD (start|stop|restart|status|pid|url|logs|help)" ;;
esac
