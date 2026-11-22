#!/usr/bin/env bash
# Publish given files to the orphan branch `ventu-data` — same model as
# push-data-update.sh: the branch always holds ONE commit (root commit-tree
# + force-with-lease push), so data history never grows and main never
# tracks public/data.
#
# Plumbing only: a temp index is built from the branch tip, the listed
# files are staged from the working tree, and a root commit-tree is pushed.
# The working tree and any local branch are never touched.
#
# Uso:
#   scripts/push-data-file.sh "mensagem de commit" <path> [<path>...]
#   REGEN_SITEMAP_RSS_ON=public/data/news.json scripts/push-data-file.sh ...
#
# REGEN_SITEMAP_RSS_ON — se esse path mudou face à branch, corre
# generate-sitemap + generate-rss antes do commit e inclui os outputs.
set -euo pipefail

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "push-data-file.sh: recusado fora do GitHub Actions." >&2
  exit 1
fi

DATA_BRANCH="ventu-data"
COMMIT_MSG="${1:?mensagem de commit em falta}"
shift
FILES=("$@")
if [ ${#FILES[@]} -eq 0 ]; then
  echo "push-data-file.sh: nenhum ficheiro indicado" >&2
  exit 1
fi

BOT_NAME="github-actions[bot]"
BOT_EMAIL="github-actions[bot]@users.noreply.github.com"

for attempt in $(seq 1 10); do
  echo "=== Push attempt ${attempt}/10 ==="
  git fetch origin "$DATA_BRANCH" || true
  TMP_INDEX="$(mktemp)"
  if git rev-parse --verify "origin/$DATA_BRANCH" >/dev/null 2>&1; then
    GIT_INDEX_FILE="$TMP_INDEX" git read-tree "origin/$DATA_BRANCH"
  else
    GIT_INDEX_FILE="$TMP_INDEX" git read-tree --empty
  fi

  GIT_INDEX_FILE="$TMP_INDEX" git add -f -A "${FILES[@]}"

  # Sitemap/RSS só quando o path marcado mudou face à DATA-BRANCH. Compara o
  # blob do ref com o ficheiro da worktree via cmp — `git diff` NÃO serve:
  # os ficheiros de public/data são untracked/ignored na main, por isso o
  # diff sai sempre vazio e o regen nunca disparava.
  if [ -n "${REGEN_SITEMAP_RSS_ON:-}" ] \
     && { ! git cat-file -e "origin/$DATA_BRANCH:$REGEN_SITEMAP_RSS_ON" 2>/dev/null \
          || ! git show "origin/$DATA_BRANCH:$REGEN_SITEMAP_RSS_ON" | cmp -s - "$REGEN_SITEMAP_RSS_ON"; }; then
    node scripts/generate-sitemap.js
    node scripts/generate-rss.js
    GIT_INDEX_FILE="$TMP_INDEX" git add -f public/sitemap.xml public/rss.xml public/rss-en.xml
  fi

  TREE=$(GIT_INDEX_FILE="$TMP_INDEX" git write-tree)
  BASE_TREE=$(git rev-parse -q --verify "origin/$DATA_BRANCH^{tree}" 2>/dev/null || echo none)
  rm -f "$TMP_INDEX"
  if [ "$TREE" = "$BASE_TREE" ]; then
    echo "Nada a publicar — conteúdo igual à ponta de $DATA_BRANCH"
    exit 0
  fi

  NEW_SHA=$(git -c "user.name=$BOT_NAME" -c "user.email=$BOT_EMAIL" commit-tree "$TREE" -m "$COMMIT_MSG")

  if git push --force-with-lease origin "$NEW_SHA:refs/heads/$DATA_BRANCH"; then
    echo "✅ Published to $DATA_BRANCH"
    exit 0
  fi

  wait=$((attempt * 6))
  echo "Push rejected — retrying in ${wait}s..."
  sleep "$wait"
done

echo "::error::Failed to publish after 10 attempts"
exit 1
