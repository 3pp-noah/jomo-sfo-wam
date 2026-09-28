#!/usr/bin/env bash
# The cron entry: refresh and publish the feeds, logging to ~/.cache/jomo-sfo-wam-feeds.log
# (kept to its last 2000 lines).
LOG="$HOME/.cache/jomo-sfo-wam-feeds.log"
mkdir -p "$(dirname "$LOG")"
{ echo "== $(date -u +%Y-%m-%dT%H:%M:%SZ)"; "$(dirname "$0")/refresh.sh" --push; } >> "$LOG" 2>&1
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
