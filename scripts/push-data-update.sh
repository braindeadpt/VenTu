#!/usr/bin/env bash
# Push public/data/ on top of latest main — avoids rebase conflicts when
# other commits land while the pipeline is fetching Open-Meteo (~6 min).
set -euo pipefail

# Só corre na CI. Mais abaixo faz `git reset --hard` + `git clean` + `git checkout -f -B main`
# para publicar os dados por cima da main mais recente: numa pasta local isso apagaria sem
# aviso o trabalho por commitar e moveria o branch main de quem (pessoa ou agente) o corresse.
# Os workflows (update-data.yml) correm sempre com GITHUB_ACTIONS=true.
if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "push-data-update.sh: recusado fora do GitHub Actions (faz git reset --hard e moveria o branch main)." >&2
  exit 1
fi

COMMIT_MSG="${1:-auto: update conditions and spots index [$(date -u +'%Y-%m-%d %H:%M UTC')]}"

# Bot identity is passed per-commit with `git -c`, never written to
# .git/config — a local run would otherwise poison the clone's identity
# forever (this repo already got stuck as github-actions[bot] that way).
BOT_NAME="github-actions[bot]"
BOT_EMAIL="github-actions[bot]@users.noreply.github.com"

if [ ! -d public/data ]; then
  echo "::error::public/data missing — nothing to publish"
  exit 1
fi

DATA_BACKUP="$(mktemp -d)"
trap 'rm -rf "$DATA_BACKUP"' EXIT
mkdir -p "$DATA_BACKUP/public-data"
cp -a public/data/. "$DATA_BACKUP/public-data/"
# Pipeline state that lives outside public/data (e.g. the wind-bias pairs
# archive) travels in the same artifact and is committed with it.
HAS_STATE=0
if [ -d data-state ]; then
  HAS_STATE=1
  mkdir -p "$DATA_BACKUP/data-state"
  cp -a data-state/. "$DATA_BACKUP/data-state/"
fi

for attempt in $(seq 1 10); do
  echo "=== Push attempt ${attempt}/10 ==="
  git fetch origin main
  # Discard anything local BEFORE the checkout: under `set -e`, a dirty tree
  # (or an untracked file in the way) makes `git checkout -B` abort before the
  # retry loop ever runs — the 2026-09-22 incident where commits landing
  # mid-pipeline killed the next bot push. Working-tree data is safe: it was
  # backed up to $DATA_BACKUP above and is re-copied right after the checkout.
  # `clean` is scoped to the generated dirs so local scripts are untouched.
  git reset --hard -q
  git clean -fdq -- public/data data-state
  git checkout -f -B main origin/main
  cp -a "$DATA_BACKUP/public-data/." public/data/
  if [ "$HAS_STATE" = 1 ]; then
    mkdir -p data-state
    cp -a "$DATA_BACKUP/data-state/." data-state/
  fi
  git add -f public/data/
  git add data-state/ 2>/dev/null || true
  # The -f above is required (public/data/ is gitignored) but it also
  # overrides the *.backup rule — unstage the write-only sidecars so the
  # ~15x/day bot commits never track them again (.gitignore line 36).
  # `*.tmp` is the atomic-write sidecar (scripts/lib/atomicWriteJson.js);
  # an orphan from a killed run must not be committed either.
  git reset -q -- '*.backup' '*.tmp'

  if git diff --staged --quiet; then
    echo "Data already matches origin/main — nothing to publish"
    exit 0
  fi

  git -c "user.name=$BOT_NAME" -c "user.email=$BOT_EMAIL" commit -m "$COMMIT_MSG"

  if git push origin main; then
    echo "✅ Data published to main"
    exit 0
  fi

  wait=$((attempt * 6))
  echo "Push rejected — retrying in ${wait}s..."
  sleep "$wait"
done

echo "::error::Failed to publish data after 10 attempts"
exit 1
