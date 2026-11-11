# JOMO SFO-WAM

**https://3pp-noah.github.io/jomo-sfo-wam/**

The JOMO SFO-WAM research-agent kernel: a causal instrument in which each of 790 agents, across
56 SFO namespaces, is its own realisation of the invariant SFO-WAM directed acyclic graph
(400 nodes, 704 edges). The dashboard carries the time-travel controls, the SFO-WAM engine
(observe, propagate, project, judge; d-separation; FORGE), and the research-agent kernel:
observations, judgments, lock-ins, projections, digest tasks, coordination actions, and a
research layer of goals, hypotheses, tests, evidence scores, episodes, policy rules, a
human-review queue and deterministic digests.

## How it runs

GitHub Pages serves files and runs no programs. The FastAPI backend (`backend/main.py`,
`backend/research_agent.py`) therefore runs **unchanged inside the page**, under Pyodide
(CPython compiled to WebAssembly), in a Web Worker:

| Part | Role |
|---|---|
| `backend/` | the backend, exactly as it runs under uvicorn |
| `kernel/py/fastapi/` | the part of FastAPI that `main.py` uses: route decorators, `HTTPException`, `JSONResponse`, `StreamingResponse` |
| `kernel/py/jomo_dispatch.py` | binds each request to its handler by FastAPI's rules (path, query, JSON body) and returns FastAPI's status codes and bodies, including 404, 405 and 422 |
| `kernel/py/jomo_clock.py` | a microsecond clock for `time.time()`; Pyodide's own advances in milliseconds, which would give successive rows equal timestamps |
| `kernel/py/httpx.py` | stand-in for the outbound model call, which the page never makes (below) |
| `kernel/worker.js`, `kernel/boot.js` | start Pyodide, write the backend and its data into its file system, answer requests |
| `kernel/shim.js` | answers the dashboard's `fetch("/api/…")` and `EventSource("/api/runtime/stream")` from the worker |
| `public/pyodide/` | Pyodide 0.28.3 with pydantic and sqlite3, vendored; nothing is loaded from elsewhere |

The dashboard source (`src/`) is unchanged apart from one line in `src/main.jsx` that loads the
shim, and the FEEDS tab in `src/sfo_wam_engine.jsx` (below). The runtime database lives in the
visitor's browser (IndexedDB): each visitor starts from the seeded goals and policy rules, and
what they do persists for them alone.

**Not available in the published page.** The Claude digest (`/api/digest`) needs an API key,
which a public page cannot hold; it answers 503 exactly as the backend does without
`ANTHROPIC_API_KEY`, and the research layer writes its deterministic local digests instead.

## Time

TNLDY is read from Nsukka on the Yg calendar, in the page (`src/nsukka-yg-clock.js`) and in the backend
(`backend/nsukka_yg_clock.py`) alike:

    Z = (yG − 1969)·Yg − 340 + days since 1 December 00:00 Nsukka,   Yg = 17640/48.3 days

Yg is the MDQNM engine's own year; it is laid on Nsukka's calendar and recalibrated at every Yg year
(1 December, 00:00 WAT), so the clock does not drift from Nsukka's. Dates are shown in Nsukka time (WAT).
A TNLDY passed over at a recalibration has no date (—). It is the same clock as on the other 3PP-NOAH sites.

## Knowledge-server feeds

A page cannot read other sites' feeds (they send no CORS headers) and GitHub Pages runs no proxy,
so the feeds are read on the author's computer and on GitHub, every 15 minutes, and published beside
the page as a snapshot.

| Part | Role |
|---|---|
| `feeds/catalogue.json` | the sources: 232, in twelve domains — world, Middle East, Russia & Eurasia, Balkans (Serbia, Bosnia and Herzegovina, Kosovo, Croatia, North Macedonia, Montenegro, Albania, plus Google News watches on their leaders' names), Asia, Africa & Nigeria, geopolitical analysis, defence & nuclear, economic, religious, science & technology, and sports (36: the NBA, the WNBA and Nigeria's Super Eagles and Super Falcons first, then the wires, broadcasters and governing bodies of world sport) — each with its perspective. 98 of them were added on 2026-11-11 to the thinner domains: papers of record, wires and public broadcasters, Israeli, Gulf, Iranian-opposition, Russian-exile, Ukrainian, Caucasus, Korean, Taiwanese, Pakistani and Nigerian desks, think tanks (CSIS, Carnegie, RAND, ECFR, Lowy, Stimson, the Washington Institute, INSS, ISS Africa, ACLED, Valdai), defence and naval titles, NATO, central banks and multilaterals, the religious press of several faiths, and science, space and cybersecurity journals |
| `feeds/build.py` | reads each publisher's RSS 2.0, RSS 1.0/RDF or Atom feed (standard library only), repairs the common faults, and writes `feeds/all.json` in both `public/` and `docs/` |
| `feeds/history.py` | logs what each snapshot adds — its sources' spans and its new items — in `feeds/history/<UTC date>.jsonl.gz`, kept 30 days, for REVOTT stamps |
| `feeds/refresh.sh [--push]` | rebuilds, commits only the snapshot and its history, and with `--push` publishes it |
| `.github/workflows/feeds.yml` | runs `feeds/refresh.sh --push` on GitHub every 15 minutes, by hand (Actions › Feeds › Run workflow), and on any push that changes the feeds' code or catalogue |
| FEEDS tab | reads `feeds/all.json`: the latest headlines across the selected domains, or source by source, with the snapshot's age |

The snapshot is a **JSON Feed 1.1** document (https://www.jsonfeed.org/version/1.1/), so any JSON
Feed reader can also subscribe to https://3pp-noah.github.io/jomo-sfo-wam/feeds/all.json. Each
item names its source in `authors` and carries `_jomo` = {source, domain, perspective, fetched}.

Sources without a feed of their own (Reuters, AP), or whose feed refuses scripts, are read through
a Google News search restricted to the publisher's site (`"google"` in the catalogue; `{year}`
there is the current year). A source that fails keeps its previous items, marked with when they
were fetched. Publisher dates later than the moment of reading are capped at that moment.

## Fidelity

`tests/fidelity.mjs` sends the same 76 requests — every route, including validation failures,
unknown paths, runtime ticks, research cycles, FORGE and the runtime loop — to the backend
under uvicorn and to the in-page kernel, both on the same stepping clock
(`tests/fake_clock.py`), and compares status and body. After masking only uuids and the
database path, **76 of 76 responses are identical** (`tests/fidelity.json`).

```bash
# reference: a fresh copy of backend/, src/agent_registry_verified.json, src/sfo_wam_engine.jsx
# and tests/, then
uvicorn tests.reference_app:app --host 127.0.0.1 --port 8043     # fastapi, pydantic, httpx installed
node tests/fidelity.mjs http://127.0.0.1:8043
```

## Build

```bash
npm ci
npm run dev       # the full application, backend included, at http://localhost:5173
npm run build     # into docs/, which GitHub Pages serves
feeds/refresh.sh --push   # new feed snapshot, committed and published; no rebuild needed
```

The feeds are refreshed every 15 minutes by the author's computer's cron, while it is on:

```
*/15 * * * * $HOME/jomo-sfo-wam/feeds/cron.sh
```

and on GitHub (`.github/workflows/feeds.yml`), about every 15 minutes, so that they stay fresh
while that computer sleeps. GitHub's own schedule (minutes 7, 22, 37 and 52) is best-effort and
fires rarely, so each run on main starts the next one itself, after the 14-minute wait timer of the
environment `feeds-timer` (Settings › Environments); a run that did not wait starts nothing. Any run
starts the chain again: Actions › Feeds › Run workflow, a push that changes the feeds' code or
catalogue, or the schedule when it fires. Away from
GitHub, `feeds/refresh.sh` first moves the checkout to GitHub's latest snapshot, and stops if a
commit there is not yet on GitHub. When both build at once, the snapshot that reaches GitHub second
is dropped, which is not a failure.

`feeds/refresh.sh` keeps a single rolling "Feeds: snapshot" commit, replaced on each run, so the
repository does not grow by one ~1.3 MB snapshot per run; the commit's message is the run's report.
`feeds/history/` keeps what the replaced snapshots added, about 1.2 MB a day for 30 days. Before
committing other work here, move onto GitHub's latest snapshot — `git fetch && git reset --keep
origin/main`, when the only local commits are snapshots — and if a run lands before the push,
`git pull --rebase`.

## Refreshing the sites

One command, on the computer that keeps the sites, refreshes every 3PP-NOAH site whose data changes: JOMO
SFO-WAM's feeds, REVOTT stamps, then GDELT into the GDELT day sources, REVOTT, the nth member,
H-Gematria/ASCII and IPPROTO.

```bash
cd ~ && ./refresh-all.sh --push     # refresh and publish every updatable site
cd ~ && ./refresh-all.sh            # refresh and commit, push nothing
cd ~ && ./refresh-all.sh --check    # what GDELT has that is new; changes nothing
```

JOMO SFO-WAM's feeds and REVOTT stamps also refresh themselves every 15 minutes, from cron; the
feeds on GitHub as well.

## Other 3PP-NOAH sites

| Site | Address |
|---|---|
| 3PP-NOAH (hub) | https://3pp-noah.github.io/ |
| NTH-HOME | https://nth-member.github.io/ |
| REVOTT atop GDELT | https://nth-member.github.io/revott/ |
| The nth member | https://nth-member.github.io/member/ |
| REVOTT stamps | https://nth-member.github.io/revott-stamps/ |
| GDELT day sources | https://nth-member.github.io/gdelt/ |
| H-Gematria/ASCII | https://nth-member.github.io/gematria/ |
| Alien Corridor Support System | https://nth-member.github.io/alien-corridor/ |
