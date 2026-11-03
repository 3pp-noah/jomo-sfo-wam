#!/usr/bin/env python3
"""Log what each feed snapshot adds, so the snapshots' history outlives the rolling commit.

    python3 feeds/history.py      (feeds/refresh.sh runs it after feeds/build.py)

The FEEDS snapshot is one rolling commit, replaced at every refresh, so a snapshot that no other
computer fetched before the next one replaced it would be lost. This appends one line, for the
snapshot just built, to feeds/history/<UTC date>.jsonl.gz:

    generated  the snapshot's time
    sources    how many sources it lists;  failed  those whose latest read failed
    span       for each source read in this snapshot, the publisher-date span of the items it
               returned [oldest, newest, count]
    new        the items it holds that the snapshot in HEAD did not -- or all of them when HEAD's
               own line is missing, so that a run that failed to log leaves a gap (NULL) in the
               history, never items missing from inside a source's span

which is what REVOTT STAMPS (its stage/history.py) keeps of every snapshot. Each line is its own
gzip member, so a day is appended to and never rewritten; days older than KEEP_DAYS are deleted.
"""

from __future__ import annotations

import datetime as dt
import gzip
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = "docs/feeds/all.json"
LOG = ROOT / "feeds" / "history"
KEEP_DAYS = 30


def coverage(feed: dict) -> dict:
    """The snapshot's time, its failed sources, and the span of each source read in it."""
    gen = feed["_jomo"]["generated"]
    srcs = feed["_jomo"].get("sources", [])
    failed = sorted(x["id"] for x in srcs if x.get("error"))
    span: dict[str, list] = {}
    for i in feed.get("items", []):
        src = i["_jomo"]["source"]
        if src in failed or i["_jomo"].get("fetched") != gen or "date_published" not in i:
            continue
        o = span.setdefault(src, [i["date_published"], i["date_published"], 0])
        o[0] = min(o[0], i["date_published"]); o[1] = max(o[1], i["date_published"]); o[2] += 1
    return {"generated": gen, "sources": len(srcs), "failed": failed, "span": dict(sorted(span.items()))}


def record(feed: dict, previous: dict | None) -> dict:
    seen = {i["id"] for i in previous.get("items", [])} if previous else set()
    return dict(coverage(feed), new=[i for i in feed.get("items", []) if i["id"] not in seen])


def logged(gen: str) -> bool:
    path = LOG / f"{gen[:10]}.jsonl.gz"
    if not path.exists():
        return False
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return any(json.loads(line)["generated"] == gen for line in f)


def main() -> None:
    feed = json.loads((ROOT / SNAPSHOT).read_text())
    head = subprocess.run(["git", "-C", str(ROOT), "show", f"HEAD:{SNAPSHOT}"], capture_output=True)
    previous = json.loads(head.stdout) if head.returncode == 0 else None
    if previous and not logged(previous["_jomo"]["generated"]):
        previous = None
    rec = record(feed, previous)
    day = rec["generated"][:10]
    LOG.mkdir(exist_ok=True)
    with gzip.open(LOG / f"{day}.jsonl.gz", "at", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + "\n")
    cutoff = (dt.date.fromisoformat(day) - dt.timedelta(days=KEEP_DAYS)).isoformat()
    for old in sorted(LOG.glob("*.jsonl.gz")):
        if old.name[:10] < cutoff:
            old.unlink()
            print(f"history: {old.name} deleted (older than {KEEP_DAYS} days)")
    what = "new items" if previous else "items (the previous snapshot was not logged)"
    print(f"history: {len(rec['new'])} {what} logged in feeds/history/{day}.jsonl.gz")


if __name__ == "__main__":
    main()
