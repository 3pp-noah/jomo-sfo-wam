#!/usr/bin/env bash
# Refresh the FEEDS tab's snapshot and commit it; with --push, publish it.
#
#   ~/jomo-sfo-wam/feeds/refresh.sh           fetch, rebuild, commit
#   ~/jomo-sfo-wam/feeds/refresh.sh --push    ... and push to GitHub Pages
#
# Stages only the two snapshot files; anything else uncommitted is reported, not swept up.
# A source that fails keeps its previous items (feeds/build.py); only a run in which every
# source fails counts as a failure.
set -u
cd "$(dirname "$0")/.." || exit 1
PUSH=0; [ "${1:-}" = "--push" ] && PUSH=1
SNAP=(public/feeds/all.json docs/feeds/all.json)

if ! python3 -B feeds/build.py; then
  echo "FAIL feeds: no source could be read; nothing committed"
  exit 1
fi
git add -- "${SNAP[@]}"
if git diff --cached --quiet -- "${SNAP[@]}"; then
  echo "feeds: unchanged"
else
  git commit -q -m "Feeds: snapshot $(date -u +%Y-%m-%dT%H:%MZ)" -- "${SNAP[@]}" && echo "feeds: committed"
fi
OTHER=$(git status --porcelain | grep -v -F -e "${SNAP[0]}" -e "${SNAP[1]}")
[ -n "$OTHER" ] && printf 'feeds: other uncommitted changes, left alone:\n%s\n' "$OTHER"
if [ $PUSH = 1 ]; then
  git push -q && echo "feeds: pushed" || { echo "FAIL feeds: push"; exit 1; }
fi
