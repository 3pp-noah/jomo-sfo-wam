#!/usr/bin/env bash
# Refresh the FEEDS tab's snapshot and commit it; with --push, publish it.
#
#   ~/jomo-sfo-wam/feeds/refresh.sh           fetch, rebuild, commit
#   ~/jomo-sfo-wam/feeds/refresh.sh --push    ... and push to GitHub Pages
#
# Run every 15 minutes by cron (see README). Stages only the two snapshot files; anything else
# uncommitted is reported, not swept up. A source that fails keeps its previous items
# (feeds/build.py); only a run in which every source fails counts as a failure.
#
# One rolling commit: when the latest commit is itself a feed snapshot touching nothing else,
# it is replaced rather than added to, and the push is forced (--force-with-lease). A snapshot
# is ~700 KB, so a new commit per run would grow the repository by gigabytes a year.
set -u
cd "$(dirname "$0")/.." || exit 1
PUSH=0; [ "${1:-}" = "--push" ] && PUSH=1
SNAP=(public/feeds/all.json docs/feeds/all.json)
SUBJECT="Feeds: snapshot"

# Runs never overlap.
exec 9>.git/feeds-refresh.lock
flock -n 9 || { echo "feeds: another refresh is running"; exit 0; }

if ! python3 -B feeds/build.py; then
  echo "FAIL feeds: no source could be read; nothing committed"
  exit 1
fi
git add -- "${SNAP[@]}"
if git diff --cached --quiet -- "${SNAP[@]}"; then
  echo "feeds: unchanged"
  exit 0
fi

rolling=0
if [ "$(git log -1 --format=%s)" = "$SUBJECT" ] && [ -z "$(git diff-tree --no-commit-id --name-only -r HEAD | grep -v -x -F -e "${SNAP[0]}" -e "${SNAP[1]}")" ]; then
  rolling=1
fi
MSG="$SUBJECT"
if [ $rolling = 1 ]; then
  git commit -q --amend --date=now -m "$MSG" -- "${SNAP[@]}" && echo "feeds: snapshot commit replaced"
else
  git commit -q -m "$MSG" -- "${SNAP[@]}" && echo "feeds: snapshot committed"
fi

OTHER=$(git status --porcelain | grep -v -F -e "${SNAP[0]}" -e "${SNAP[1]}")
[ -n "$OTHER" ] && printf 'feeds: other uncommitted changes, left alone:\n%s\n' "$OTHER"

if [ $PUSH = 1 ]; then
  if [ $rolling = 1 ]; then
    git push -q --force-with-lease origin HEAD:main
  else
    git push -q origin HEAD:main
  fi && echo "feeds: pushed" || { echo "FAIL feeds: push"; exit 1; }
fi
