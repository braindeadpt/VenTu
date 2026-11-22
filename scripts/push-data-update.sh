#!/usr/bin/env bash
# Publish public/data/ to the orphan branch `ventu-data` — the branch always
# holds a single commit (root commit-tree + force-with-lease push), so data
# history never grows. Plumbing only: the working tree and any local branch
# are never touched (the reset/clean/checkout machinery that needed the
# GITHUB_ACTIONS guard below is gone).
set -euo pipefail

# Só corre na CI — os workflows (update-data.yml) correm sempre com
# GITHUB_ACTIONS=true. O script já não destrói a worktree, mas manter o
# guard evita pushes acidentais de dados de dev para a branch partilhada.
if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "push-data-update.sh: recusado fora do GitHub Actions (faz git reset --hard e moveria o branch main)." >&2
  exit 1
fi

COMMIT_MSG="${1:-auto: update conditions and spots index [$(date -u +'%Y-%m-%d %H:%M UTC')]}"

# Destino: branch órfão `ventu-data` — public/data + data-state vivem lá,
# nunca na main (história = 1 commit via --amend + force-with-lease; o .git
# tinha 4.7 GB porque meses de dados voláteis ficavam em main).
DATA_BRANCH="ventu-data"

# Bot identity is passed per-commit with `git -c`, never written to
# .git/config — a local run would otherwise poison the clone's identity
# forever (this repo already got stuck as github-actions[bot] that way).
BOT_NAME="github-actions[bot]"
BOT_EMAIL="github-actions[bot]@users.noreply.github.com"

if [ ! -d public/data ]; then
  echo "::error::public/data missing — nothing to publish"
  exit 1
fi



# Publica via plumbing: índice temporário com a árvore de origin/ventu-data,
# add dos ficheiros frescos, write-tree + commit-tree (commit raiz — a branch
# fica sempre com 1 commit) + push --force-with-lease. A working tree NUNCA
# muda — sem reset/clean/checkout — por isso o código do repo (needed pelo
# generate-sitemap) fica intacto e nada pode ser apagado por engano.
OWNED_EXCLUDES=(
  ':(exclude)public/data/news.json'
  ':(exclude)public/data/dawn-patrol.json'
  ':(exclude)public/data/community-tips.json'
  ':(exclude)public/data/directory.json'
)

for attempt in $(seq 1 10); do
  echo "=== Push attempt ${attempt}/10 ==="
  git fetch origin "$DATA_BRANCH" || true
  TMP_INDEX="$(mktemp)"
  if git rev-parse --verify "origin/$DATA_BRANCH" >/dev/null 2>&1; then
    GIT_INDEX_FILE="$TMP_INDEX" git read-tree "origin/$DATA_BRANCH"
  else
    # Primeira corrida: seed da árvore com os dados actuais da main (só os
    # dirs de dados — ficheiros de código nunca entram nesta branch).
    GIT_INDEX_FILE="$TMP_INDEX" git read-tree --empty
    # SEM -u: index-only — -u escreveria os dados commitados da main por cima
    # dos ficheiros frescos gerados na worktree (o `git add` a seguir é quem
    # apanha a worktree).
    GIT_INDEX_FILE="$TMP_INDEX" git read-tree --prefix=public/data/ "origin/main:public/data" 2>/dev/null || true
    git cat-file -e "origin/main:data-state" 2>/dev/null &&
      GIT_INDEX_FILE="$TMP_INDEX" git read-tree --prefix=data-state/ "origin/main:data-state" || true
  fi
  # Stage da worktree (o job já lá pôs os dados frescos antes de chamar este
  # script). `-A` captura ADIÇÕES e REMOÇÕES — frames de radar/sat podadas e
  # forecasts de spots removidos saem da árvore (o bug das frames órfãs:
  # 0f204022d, 46 frames a 7/out). Os ficheiros dos outros bots
  # (news/dawn-patrol/contributions/directory) ficam excluídos — mantêm a
  # versão que veio no read-tree da ponta do branch (o bug do revert
  # news.json, 8568e4bc/31-10).
  GIT_INDEX_FILE="$TMP_INDEX" git add -f -A public/data/ "${OWNED_EXCLUDES[@]}"
  if [ -d data-state ]; then
    GIT_INDEX_FILE="$TMP_INDEX" git add -f -A data-state/
  fi
  # Sidecars write-only nunca entram (.gitignore linha 36; órfãos de runs
  # mortos — atomic-write *.tmp).
  GIT_INDEX_FILE="$TMP_INDEX" git reset -q -- '*.backup' '*.tmp'
  # forecasts.json agregado — nunca trackeado (leitores montam o índice da
  # pasta, scripts/lib/forecastsIndex.js).
  GIT_INDEX_FILE="$TMP_INDEX" git rm -q --cached --ignore-unmatch -- public/data/forecasts.json

  # Sitemap: regenerado quando a estrutura muda com estes dados (news.json,
  # directory.json, spots). Drift check compara com a versão na data-branch;
  # só-lastmod restaura a versão base (zero churn extra).
  if [ -f scripts/generate-sitemap.js ] && [ -f scripts/check-sitemap-drift.js ]; then
    node scripts/generate-sitemap.js >/dev/null
    if git cat-file -e "origin/$DATA_BRANCH:public/sitemap.xml" 2>/dev/null \
       && SITEMAP_DRIFT_REF="origin/$DATA_BRANCH" node scripts/check-sitemap-drift.js >/dev/null 2>&1; then
      git show "origin/$DATA_BRANCH:public/sitemap.xml" > public/sitemap.xml
    else
      echo "Sitemap: regenerado para a data-branch"
      GIT_INDEX_FILE="$TMP_INDEX" git add -f public/sitemap.xml
    fi
  fi

  TREE=$(GIT_INDEX_FILE="$TMP_INDEX" git write-tree)
  BASE_TREE=$(git rev-parse -q --verify "origin/$DATA_BRANCH^{tree}" 2>/dev/null || echo none)
  rm -f "$TMP_INDEX"
  if [ "$TREE" = "$BASE_TREE" ]; then
    echo "Data already matches origin/$DATA_BRANCH — nothing to publish"
    exit 0
  fi

  # Commit raiz (sem parentes): cada push substitui a ponta — a branch fica
  # sempre com 1 commit e a história de dados nunca cresce.
  NEW_SHA=$(git -c "user.name=$BOT_NAME" -c "user.email=$BOT_EMAIL" commit-tree "$TREE" -m "$COMMIT_MSG")

  if git push --force-with-lease origin "$NEW_SHA:refs/heads/$DATA_BRANCH"; then
    echo "✅ Data published to $DATA_BRANCH"
    exit 0
  fi

  wait=$((attempt * 6))
  echo "Push rejected — retrying in ${wait}s..."
  sleep "$wait"
done

echo "::error::Failed to publish data after 10 attempts"
exit 1
