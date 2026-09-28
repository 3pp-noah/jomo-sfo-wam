# JOMO SFO-WAM

**https://3pp-noah.github.io/jomo-sfo-wam/**

The JOMO SFO-WAM research-agent kernel: a causal instrument in which each of 790 agents, across
56 SFO namespaces, is its own realisation of the invariant SFO-WAM directed acyclic graph
(399 nodes, 701 edges). The dashboard carries the time-travel controls, the SFO-WAM engine
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

## Knowledge-server feeds

A page cannot read other sites' feeds (they send no CORS headers) and GitHub Pages runs no proxy,
so the feeds are read on the author's computer and published beside the page as a snapshot.

| Part | Role |
|---|---|
| `feeds/catalogue.json` | the sources: 75, in ten domains — world, Middle East, Russia & Eurasia, Asia, Africa & Nigeria, geopolitical analysis, defence & nuclear, economic, religious, science & technology — each with its perspective |
| `feeds/build.py` | reads each publisher's RSS 2.0, RSS 1.0/RDF or Atom feed (standard library only), repairs the common faults, and writes `feeds/all.json` in both `public/` and `docs/` |
| `feeds/refresh.sh [--push]` | rebuilds, commits only the snapshot, and with `--push` publishes it |
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

On the author's computer the feeds are refreshed every 15 minutes by cron:

```
*/15 * * * * $HOME/jomo-sfo-wam/feeds/cron.sh
```

`feeds/refresh.sh` keeps a single rolling "Feeds: snapshot" commit, replaced on each run, so the
repository does not grow by one ~700 KB snapshot per run.

## Other 3PP-NOAH sites

| Site | Address |
|---|---|
| 3PP-NOAH (hub) | https://3pp-noah.github.io/ |
| NTH-HOME | https://nth-member.github.io/ |
| REVOTT atop GDELT | https://nth-member.github.io/revott/ |
| The nth member | https://nth-member.github.io/member/ |
| GDELT day sources | https://nth-member.github.io/gdelt/ |
| H-Gematria/ASCII | https://nth-member.github.io/gematria/ |
| Alien Corridor Support System | https://nth-member.github.io/alien-corridor/ |
