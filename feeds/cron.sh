#!/usr/bin/env bash
# The cron entry on the author's computer: refresh and publish the feeds, logging to
# ~/.cache/jomo-sfo-wam-feeds.log (kept to its last 2000 lines). GitHub refreshes them as well
# (.github/workflows/feeds.yml) when its scheduler fires, so they can stay fresh while this
# computer sleeps; each run starts from the other's latest snapshot (feeds/refresh.sh).
LOG="$HOME/.cache/jomo-sfo-wam-feeds.log"
mkdir -p "$(dirname "$LOG")"
{ echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ)"; "$(dirname "$0")/refresh.sh" --push; } >> "$LOG" 2>&1
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
