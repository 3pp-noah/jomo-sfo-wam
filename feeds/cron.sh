#!/usr/bin/env bash
# Retired 2026-11-03: the feeds are refreshed on GitHub every 15 minutes (.github/workflows/feeds.yml),
# whether or not this computer is on, so the crontab entry that runs this script does nothing now.
# To remove it:
#   crontab -l | grep -v 'jomo-sfo-wam/feeds/cron.sh' | crontab -
# For a snapshot now from this computer: feeds/refresh.sh --push (or ~/refresh-all.sh --push).
exit 0
