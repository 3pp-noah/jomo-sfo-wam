#!/usr/bin/env bash
# Refresh the FEEDS tab's snapshot and commit it; with --push, publish it.
#
#   ~/jomo-sfo-wam/feeds/refresh.sh           fetch, rebuild, commit
#   ~/jomo-sfo-wam/feeds/refresh.sh --push    ... and push to GitHub Pages
#
# Run every 15 minutes on GitHub (.github/workflows/feeds.yml), whether or not the author's
# computer is on; run here by hand, or by ~/refresh-all.sh, for a snapshot now. Stages only the
# two snapshot files and their history (feeds/history.py); anything else uncommitted is reported,
# not swept up. A source that fails keeps its previous items (feeds/build.py); only a run in which
# every source fails counts as a failure.
#
# One rolling commit: when the latest commit is itself a feed snapshot touching nothing else,
# it is replaced rather than added to, and the push is forced (--force-with-lease). A snapshot
# is ~1.3 MB, so a new commit per run would grow the repository by gigabytes a year. The commit's
# message carries the run's report.
set -u
cd "$(dirname "$0")/.." || exit 1
PUSH=0; [ "${1:-}" = "--push" ] && PUSH=1
SNAP=(public/feeds/all.json docs/feeds/all.json)
HIST=feeds/history
SUBJECT="Feeds: snapshot"
BRANCH=$(git symbolic-ref --short HEAD) || exit 1

# A commit that is a feed snapshot touching nothing else.
snapshot_only() {
  [ "$(git log -1 --format=%s "$1")" = "$SUBJECT" ] &&
    [ -z "$(git diff-tree --no-commit-id --name-only -r "$1" | grep -v -x -F -e "${SNAP[0]}" -e "${SNAP[1]}" | grep -v "^$HIST/")" ]
}

# Runs never overlap, from any worktree.
exec 9>"$(git rev-parse --git-common-dir)/feeds-refresh.lock"
flock -n 9 || { echo "feeds: another refresh is running"; exit 0; }

# Away from GitHub, start from GitHub's latest snapshot: this checkout's own snapshot commits are
# stale, and any other commit not yet on GitHub has to be pushed first.
if [ -z "${GITHUB_ACTIONS:-}" ]; then
  git fetch -q origin "$BRANCH" || { echo "FAIL feeds: fetch"; exit 1; }
  for c in $(git rev-list "origin/$BRANCH..HEAD"); do
    snapshot_only "$c" || { echo "FAIL feeds: $BRANCH has commits not yet on GitHub; push them first"; exit 1; }
  done
  git reset -q --keep "origin/$BRANCH" || { echo "FAIL feeds: could not move to origin/$BRANCH"; exit 1; }
fi

if ! REPORT=$(python3 -B feeds/build.py 2>&1); then
  echo "$REPORT"
  echo "FAIL feeds: no source could be read; nothing committed"
  exit 1
fi
REPORT+=$'\n'$(python3 -B feeds/history.py 2>&1 || echo "FAIL feeds: history not logged")
echo "$REPORT"
git add -A -- "${SNAP[@]}" "$HIST"
if git diff --cached --quiet -- "${SNAP[@]}" "$HIST"; then
  echo "feeds: unchanged"
  exit 0
fi

rolling=0
snapshot_only HEAD && rolling=1
if [ $rolling = 1 ]; then
  git commit -q --amend --date=now -m "$SUBJECT" -m "$REPORT" -- "${SNAP[@]}" "$HIST" && echo "feeds: snapshot commit replaced"
else
  git commit -q -m "$SUBJECT" -m "$REPORT" -- "${SNAP[@]}" "$HIST" && echo "feeds: snapshot committed"
fi

OTHER=$(git status --porcelain | grep -v -F -e "${SNAP[0]}" -e "${SNAP[1]}" -e " $HIST/")
[ -n "$OTHER" ] && printf 'feeds: other uncommitted changes, left alone:\n%s\n' "$OTHER"

if [ $PUSH = 1 ]; then
  if [ $rolling = 1 ]; then
    git push -q --force-with-lease origin "HEAD:$BRANCH"
  else
    git push -q origin "HEAD:$BRANCH"
  fi && echo "feeds: pushed" || { echo "FAIL feeds: push"; exit 1; }
fi
