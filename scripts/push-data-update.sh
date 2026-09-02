#!/usr/bin/env bash
# Push public/data/ on top of latest main — avoids rebase conflicts when
# other commits land while the pipeline is fetching Open-Meteo (~6 min).
set -euo pipefail

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
cp -a public/data/. "$DATA_BACKUP/"

for attempt in $(seq 1 10); do
  echo "=== Push attempt ${attempt}/10 ==="
  git fetch origin main
  git checkout -B main origin/main
  cp -a "$DATA_BACKUP/." public/data/
  git add -f public/data/
  # The -f above is required (public/data/ is gitignored) but it also
  # overrides the *.backup rule — unstage the write-only sidecars so the
  # ~15x/day bot commits never track them again (.gitignore line 36).
  git reset -q -- '*.backup'

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
