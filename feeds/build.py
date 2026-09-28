#!/usr/bin/env python3
"""Fetch the knowledge-server feeds and publish one JSON Feed 1.1 snapshot for the FEEDS tab.

    python3 feeds/build.py

A static page cannot read most publishers' feeds itself: they send no CORS headers, and GitHub
Pages runs no proxy. This script reads every source in feeds/catalogue.json (RSS 2.0, RSS 1.0/RDF
or Atom, whichever the publisher offers), normalises the items, and writes

    public/feeds/all.json   and   docs/feeds/all.json

a single JSON Feed 1.1 document (https://www.jsonfeed.org/version/1.1/). Each item names its
source in `authors` and carries `_jomo` = {source, domain, perspective}; the top-level `_jomo`
records, per source, when it was last fetched successfully and why the latest attempt failed.

A source that fails keeps its items from the previous snapshot, marked with the time they were
fetched, so one bad run does not empty it. Standard library only.
"""

from __future__ import annotations

import concurrent.futures as cf
import datetime as dt
import email.utils
import gzip
import html
import html.entities
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "feeds" / "catalogue.json"
OUTPUTS = [ROOT / "public" / "feeds" / "all.json", ROOT / "docs" / "feeds" / "all.json"]
SITE = "https://3pp-noah.github.io/jomo-sfo-wam/"

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
ITEMS_PER_SOURCE = 15
SUMMARY_CHARS = 280
MAX_AGE_DAYS = 21
XML_ENTITIES = {"amp", "lt", "gt", "quot", "apos"}
# Index pages that search-based sources return alongside articles, and titles with no words.
NOT_ARTICLES = re.compile(r"^(sitemap\b|archives?\b|-\s)|\barchives?\b.*\bpage \d+ of \d+|^[^A-Za-z]*$", re.I)


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def iso(d: dt.datetime) -> str:
    return d.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_date(text: str | None) -> dt.datetime | None:
    text = (text or "").strip()
    if not text:
        return None
    try:
        d = email.utils.parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def repair(raw: bytes) -> bytes:
    """Make the common publisher faults parseable: bytes before the root element, HTML named
    entities that XML does not define, and bare ampersands."""
    text = raw.decode("utf-8", errors="replace").lstrip("﻿ \t\r\n")
    start = text.find("<")
    text = text[start:] if start > 0 else text

    def entity(m: re.Match[str]) -> str:
        name = m.group(1)
        if name in XML_ENTITIES:
            return m.group(0)
        cp = html.entities.name2codepoint.get(name)
        return f"&#{cp};" if cp else f"&amp;{name};"

    text = re.sub(r"&([A-Za-z][A-Za-z0-9]*);", entity, text)
    text = re.sub(r"&(?!#?[A-Za-z0-9]+;)", "&amp;", text)
    return text.encode("utf-8")


def parse_xml(raw: bytes) -> ET.Element:
    try:
        return ET.fromstring(raw)
    except ET.ParseError:
        root = repair(raw)
        try:
            return ET.fromstring(root)
        except ET.ParseError:
            # Trailing junk after the root element: cut at the root's closing tag.
            text = root.decode("utf-8")
            m = re.match(r"(?:<\?[^>]*\?>\s*|<!--.*?-->\s*|<!DOCTYPE[^>]*>\s*)*<([A-Za-z:_][\w:.-]*)", text, re.S)
            end = text.rfind(f"</{m.group(1)}>") if m else -1
            if end < 0:
                raise
            return ET.fromstring(text[: end + len(m.group(1)) + 3])


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child_text(el: ET.Element, *names: str) -> str:
    for c in el:
        if local(c.tag) in names and (c.text or "").strip():
            return c.text.strip()
    return ""


def plain(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html.unescape(text or ""))
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def clip(text: str, n: int) -> str:
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "…"


def source_url(source: dict) -> str:
    """A catalogue entry has either the publisher's own "url", or "google": a site path for a
    Google News search (for publishers with no feed, or one that refuses scripts). "{year}" in
    the path is the current year; "days" bounds the search; "terms" narrows it."""
    if "url" in source:
        return source["url"]
    site = source["google"].replace("{year}", str(utc_now().year))
    q = f"when:{source.get('days', 2)}d site:{site}" + (f" {source['terms']}" if source.get("terms") else "")
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-US", "gl": "US", "ceid": "US:en"})


def items_of(root: ET.Element, source: dict) -> list[dict]:
    via_google = "google" in source
    out = []
    for el in root.iter():
        if local(el.tag) not in ("item", "entry"):
            continue
        title = plain(child_text(el, "title"))
        link = ""
        for c in el:
            if local(c.tag) == "link":
                if (c.text or "").strip():
                    link = c.text.strip()
                    break
                if c.get("href") and c.get("rel", "alternate") == "alternate":
                    link = c.get("href")
                    break
        if not link:
            guid = child_text(el, "guid", "id")
            link = guid if guid.startswith("http") else ""
        summary = plain(child_text(el, "description", "summary", "content", "encoded"))
        date = parse_date(child_text(el, "pubDate", "published", "updated", "date", "issued"))
        if via_google:
            # Google News titles end in " - Publisher"; its summary only repeats the title.
            title = re.sub(r"\s+-\s+[^-]+$", "", title)
        if via_google or source.get("summary") is False:
            # Also for publishers whose summaries carry their page navigation.
            summary = ""
        if summary and summary.lower().startswith(title.lower()):
            summary = summary[len(title):].lstrip(" .:-–—")
        if not title or not link or NOT_ARTICLES.search(title):
            continue
        item = {
            "id": link,
            "url": link,
            "title": title,
            "authors": [{"name": source["label"]}],
            "_jomo": {"source": source["id"], "domain": source["domain"], "perspective": source["perspective"]},
        }
        if summary:
            item["summary"] = clip(summary, SUMMARY_CHARS)
        if date:
            # Some publishers stamp local time as UTC, which puts items in the future;
            # such an item is dated no later than the moment it was read.
            item["date_published"] = iso(min(date, utc_now()))
        out.append(item)
    cutoff = utc_now() - dt.timedelta(days=MAX_AGE_DAYS)
    dated = [i for i in out if "date_published" in i]
    if dated:
        # Newest first; undated items keep the publisher's order after the dated ones.
        fresh = sorted((i for i in dated if parse_date(i["date_published"]) >= cutoff),
                       key=lambda i: i["date_published"], reverse=True)
        out = fresh + [i for i in out if "date_published" not in i]
    seen, unique = set(), []
    for i in out:
        if i["url"] not in seen:
            seen.add(i["url"])
            unique.append(i)
    return unique[:ITEMS_PER_SOURCE]


def fetch(source: dict) -> tuple[list[dict] | None, str | None]:
    try:
        req = urllib.request.Request(source_url(source), headers={
            "User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read(8_000_000)
            if r.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
        items = items_of(parse_xml(raw), source)
        if not items:
            return None, "no items"
        return items, None
    except Exception as exc:  # one failing publisher must not stop the others
        return None, f"{type(exc).__name__}: {exc}"[:160]


def previous() -> dict:
    for path in OUTPUTS:
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError):
            continue
    return {}


def main() -> int:
    catalogue = json.loads(CATALOGUE.read_text())
    before = previous()
    old_items: dict[str, list[dict]] = {}
    for item in before.get("items", []):
        old_items.setdefault(item["_jomo"]["source"], []).append(item)
    old_status = {s["id"]: s for s in before.get("_jomo", {}).get("sources", [])}

    now = iso(utc_now())
    with cf.ThreadPoolExecutor(16) as pool:
        results = list(pool.map(fetch, catalogue))

    items, status, failed = [], [], 0
    for source, (got, error) in zip(catalogue, results):
        entry = {k: source[k] for k in ("id", "label", "domain", "perspective")}
        entry["via"] = "Google News" if "google" in source else "publisher"
        if got is not None:
            for i in got:
                i["_jomo"]["fetched"] = now
            items += got
            entry.update(fetched=now, count=len(got), error=None)
        else:
            failed += 1
            kept = [i for i in old_items.get(source["id"], []) if not NOT_ARTICLES.search(i["title"])]
            items += kept
            prior = old_status.get(source["id"], {})
            entry.update(fetched=prior.get("fetched"), count=len(kept), error=error)
        status.append(entry)

    feed = {
        "version": "https://jsonfeed.org/version/1.1",
        "title": "JOMO SFO-WAM knowledge servers",
        "home_page_url": SITE,
        "feed_url": SITE + "feeds/all.json",
        "description": f"Headlines from {len(catalogue)} news, geopolitical-analysis, defence, economic, "
                       "religious and science sources, as fetched for the SFO-WAM FEEDS tab.",
        "language": "en",
        "_jomo": {"generated": now, "sources": status},
        "items": items,
    }
    text = json.dumps(feed, ensure_ascii=False, separators=(",", ":"))
    for path in OUTPUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    ok = len(catalogue) - failed
    print(f"feeds: {ok}/{len(catalogue)} sources fetched, {len(items)} items, {len(text) // 1024} KB")
    for s in status:
        if s["error"]:
            print(f"  FAIL {s['id']}: {s['error']}  (kept {s['count']} from {s['fetched'] or 'never'})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
