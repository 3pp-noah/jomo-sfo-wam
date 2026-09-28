var v=`"""The part of FastAPI that backend/main.py uses, for running it inside the page.

GitHub Pages serves files and runs nothing, so the backend runs in the browser under Pyodide.
This module records the routes that main.py declares; kernel/py/jomo_dispatch.py binds each
request to the recorded handler the way FastAPI does. The handlers themselves are unchanged.
"""

from __future__ import annotations

from typing import Any, Callable


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: Any = None, headers: dict[str, str] | None = None) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.headers = headers


class Route:
    def __init__(self, method: str, path: str, endpoint: Callable[..., Any]) -> None:
        self.method = method
        self.path = path
        self.endpoint = endpoint


class FastAPI:
    def __init__(self, **kwargs: Any) -> None:
        self.settings = kwargs
        self.routes: list[Route] = []
        self.middleware: list[tuple[Any, dict[str, Any]]] = []

    def add_middleware(self, cls: Any, **options: Any) -> None:
        # CORS has no meaning when the page and the backend share one origin.
        self.middleware.append((cls, options))

    def _route(self, method: str, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            self.routes.append(Route(method, path, fn))
            return fn
        return decorator

    def get(self, path: str, **_: Any):
        return self._route("GET", path)

    def post(self, path: str, **_: Any):
        return self._route("POST", path)

    def put(self, path: str, **_: Any):
        return self._route("PUT", path)

    def patch(self, path: str, **_: Any):
        return self._route("PATCH", path)

    def delete(self, path: str, **_: Any):
        return self._route("DELETE", path)
`,b=`class CORSMiddleware:
    """Recorded by FastAPI.add_middleware and otherwise unused: the page and the backend share one origin."""
`,w=`from __future__ import annotations

from typing import Any


class JSONResponse:
    media_type = "application/json"

    def __init__(self, content: Any = None, status_code: int = 200, headers: dict[str, str] | None = None) -> None:
        self.content = content
        self.status_code = status_code
        self.headers = headers or {}


class StreamingResponse:
    def __init__(self, content: Any, status_code: int = 200, media_type: str | None = None,
                 headers: dict[str, str] | None = None) -> None:
        self.body_iterator = content
        self.status_code = status_code
        self.media_type = media_type
        self.headers = headers or {}
`,z=`"""Stand-in for httpx. main.py uses it only to call the Anthropic API, and only when
ANTHROPIC_API_KEY is set; the published page never holds a key, so this is never reached."""


class AsyncClient:
    def __init__(self, *args, **kwargs):
        raise RuntimeError("Outbound model calls are not available in the published page.")
`,x=`"""A microsecond wall clock for time.time() inside the page.

Pyodide's time.time() advances in whole milliseconds, so rows written within one millisecond
share a timestamp and the backend's "ORDER BY ts DESC" lists them in an arbitrary order. Native
Python reads the clock to the microsecond, which keeps successive rows distinct and in order.
This reading comes from performance.now() and is made strictly increasing by at least 1 µs.
"""

import time

from js import performance

_last = 0.0


def _time() -> float:
    global _last
    t = (performance.timeOrigin + performance.now()) / 1000.0
    if t <= _last:
        t = _last + 1e-6
    _last = t
    return t


time.time = _time
`,k=`"""Answer the page's /api/* requests with backend/main.py's own route handlers.

Binding follows FastAPI's rules for the parameter kinds main.py uses: path parameters, a
pydantic model or a dict as the JSON body, and scalar query parameters. Errors take FastAPI's
shapes: HTTPException -> {"detail": ...}; validation -> 422 {"detail": [...]}; anything else
-> 500 "Internal Server Error". Bodies are encoded as FastAPI's JSONResponse encodes them.
"""

from __future__ import annotations

import asyncio
import dataclasses
import inspect
import json
import re
import traceback
import typing
from pathlib import PurePath
from typing import Any
from urllib.parse import parse_qsl

from pydantic import BaseModel, TypeAdapter, ValidationError

from fastapi import HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

_ROUTES: list[tuple[str, re.Pattern[str], Any]] = []
_STREAMS: dict[int, asyncio.Task[Any]] = {}


def install(app: Any) -> int:
    _ROUTES.clear()
    for route in app.routes:
        pattern = re.sub(r"\\{(\\w+)\\}", r"(?P<\\1>[^/]+)", route.path)
        _ROUTES.append((route.method, re.compile(f"^{pattern}$"), route.endpoint))
    return len(_ROUTES)


def jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return jsonable(value.model_dump())
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return jsonable(dataclasses.asdict(value))
    if isinstance(value, dict):
        return {str(jsonable(k)): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [jsonable(v) for v in value]
    if isinstance(value, PurePath):
        return str(value)
    return value


def render(content: Any) -> str:
    return json.dumps(content, ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":"))


def reply(status: int, content: Any, media_type: str = "application/json") -> dict[str, Any]:
    text = content if media_type != "application/json" else render(content)
    return {"status": status, "media_type": media_type, "body": text}


def error_list(exc: ValidationError, prefix: tuple[Any, ...]) -> list[dict[str, Any]]:
    out = []
    for err in exc.errors(include_url=False):
        err = dict(err)
        err["loc"] = [*prefix, *err.get("loc", ())]
        out.append(jsonable(err))
    return out


class _Unprocessable(Exception):
    def __init__(self, errors: list[dict[str, Any]]) -> None:
        self.errors = errors


def _is_body_type(annotation: Any) -> bool:
    if inspect.isclass(annotation) and issubclass(annotation, BaseModel):
        return True
    origin = typing.get_origin(annotation) or annotation
    return origin in (dict, list)


def _bind(endpoint: Any, path_params: dict[str, str], query: dict[str, str], body_text: str | None) -> dict[str, Any]:
    hints = typing.get_type_hints(endpoint)
    kwargs: dict[str, Any] = {}
    errors: list[dict[str, Any]] = []
    for name, param in inspect.signature(endpoint).parameters.items():
        annotation = hints.get(name, Any)
        if name in path_params:
            try:
                kwargs[name] = TypeAdapter(annotation).validate_python(path_params[name])
            except ValidationError as exc:
                errors += error_list(exc, ("path", name))
        elif _is_body_type(annotation):
            if not body_text:
                if param.default is inspect.Parameter.empty:
                    errors.append({"type": "missing", "loc": ["body"], "msg": "Field required", "input": None})
                else:
                    kwargs[name] = param.default
                continue
            try:
                data = json.loads(body_text)
            except json.JSONDecodeError as exc:
                errors.append({"type": "json_invalid", "loc": ["body", exc.pos], "msg": "JSON decode error",
                               "input": {}, "ctx": {"error": exc.msg}})
                continue
            try:
                kwargs[name] = TypeAdapter(annotation).validate_python(data)
            except ValidationError as exc:
                errors += error_list(exc, ("body",))
        elif name in query:
            try:
                kwargs[name] = TypeAdapter(annotation).validate_python(query[name])
            except ValidationError as exc:
                errors += error_list(exc, ("query", name))
        elif param.default is inspect.Parameter.empty:
            errors.append({"type": "missing", "loc": ["query", name], "msg": "Field required", "input": None})
    if errors:
        raise _Unprocessable(errors)
    return kwargs


def _match(method: str, path: str) -> tuple[Any, dict[str, str], bool]:
    path_seen = False
    for route_method, pattern, endpoint in _ROUTES:
        m = pattern.match(path)
        if not m:
            continue
        path_seen = True
        if route_method == method:
            return endpoint, m.groupdict(), True
    return None, {}, path_seen


async def _call(method: str, url: str, body_text: str | None) -> tuple[Any, Any]:
    path, _, qs = url.partition("?")
    endpoint, path_params, path_seen = _match(method.upper(), path)
    if endpoint is None:
        if path_seen:
            return None, reply(405, {"detail": "Method Not Allowed"})
        return None, reply(404, {"detail": "Not Found"})
    query = dict(parse_qsl(qs, keep_blank_values=True))
    try:
        kwargs = _bind(endpoint, path_params, query, body_text)
        result = await endpoint(**kwargs)
    except _Unprocessable as exc:
        return None, reply(422, {"detail": exc.errors})
    except HTTPException as exc:
        return None, reply(exc.status_code, {"detail": jsonable(exc.detail)})
    except Exception:
        traceback.print_exc()
        return None, reply(500, "Internal Server Error", "text/plain")
    if isinstance(result, StreamingResponse):
        return result, None
    if isinstance(result, JSONResponse):
        return None, reply(result.status_code, result.content)
    return None, reply(200, jsonable(result))


async def handle(method: str, url: str, body_text: str | None = None) -> str:
    """One request -> JSON text of {status, media_type, body}."""
    stream, response = await _call(method, url, body_text)
    if stream is not None:
        return render(reply(400, {"detail": "Streaming endpoints are opened with open_stream()."}))
    return render(response)


async def _pump(stream: StreamingResponse, on_chunk: Any) -> None:
    async for chunk in stream.body_iterator:
        on_chunk(chunk if isinstance(chunk, str) else chunk.decode("utf-8"))


async def open_stream(stream_id: int, url: str, on_chunk: Any) -> str:
    stream, response = await _call("GET", url, None)
    if stream is None:
        return render(response)
    _STREAMS[stream_id] = asyncio.ensure_future(_pump(stream, on_chunk))
    return render(reply(stream.status_code, None, stream.media_type or "text/event-stream"))


def close_stream(stream_id: int) -> None:
    task = _STREAMS.pop(stream_id, None)
    if task is not None:
        task.cancel()
`;const i="/app";async function T(n,e,{persist:a=async()=>{},prelude:d=""}={}){await n.loadPackage(["pydantic","sqlite3"],{messageCallback:()=>{}});const c=n.FS,f=t=>{let s="";for(const o of t.split("/").filter(Boolean))s+="/"+o,c.analyzePath(s).exists||c.mkdir(s)};f(`${i}/backend/runtime_state`),f(`${i}/src`),await a(`${i}/backend/runtime_state`),await a(`${i}/src`);for(const[t,s]of Object.entries(e)){const o=`${i}/${t}`;f(o.slice(0,o.lastIndexOf("/"))),!(t==="src/agent_registry_verified.json"&&c.analyzePath(o).exists)&&c.writeFile(o,s)}await n.runPythonAsync(`
import sys
sys.path[:0] = ["${i}/kernel/py", "${i}"]
${d}
import backend.main as jomo_main
import jomo_dispatch
jomo_dispatch.install(jomo_main.app)
`);const p=n.pyimport("jomo_dispatch");return{async request(t,s,o){return JSON.parse(await p.handle(t,s,o??null))},async openStream(t,s,o){return JSON.parse(await p.open_stream(t,s,o))},closeStream(t){p.close_stream(t)}}}var E=`from __future__ import annotations

import ast
import asyncio
import json
import os
import re
import sqlite3
import time
import uuid
from bisect import bisect_right
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Optional

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, StreamingResponse
    from pydantic import BaseModel, Field
except ImportError as exc:  # pragma: no cover - startup diagnostic
    raise SystemExit(
        "FastAPI runtime dependencies are missing. Run: python -m pip install -r backend/requirements.txt"
    ) from exc

from backend.research_agent import (
    GenerateDigestRequest,
    HumanReviewItemRequest,
    PolicyRuleRequest,
    ResearchAgent,
    ResearchEpisodeRequest,
    ResearchGoalRequest,
    ResearchHypothesisRequest,
    ResolveReviewRequest,
    RunResearchCycleRequest,
    RunResearchTestRequest,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = PROJECT_ROOT / "src" / "agent_registry_verified.json"
GRAPH_SOURCE_PATH = PROJECT_ROOT / "src" / "sfo_wam_engine.jsx"
DB_PATH = PROJECT_ROOT / "backend" / "runtime_state" / "jomo_causal_kernel.sqlite3"
LOCAL_ENV_PATH = PROJECT_ROOT / ".env.local"

EPOCH = 4703008911.6524158066013043478202
MSD = 86400000
DEFAULT_MODEL = "claude-sonnet-4-20250514"
DEFAULT_SYSTEM = (
    "You are JOMO/Claude operating as a bounded digest and targeting instrument for the "
    "SFO-WAM causal kernel. Distinguish structural prior, observed evidence, conditioning "
    "state, uncertainty, projection status, and recommended next action. Do not overclaim."
)


def load_local_env() -> None:
    if not LOCAL_ENV_PATH.exists():
        return
    for raw in LOCAL_ENV_PATH.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def now_ts() -> float:
    return time.time()


def tnldy_now() -> float:
    return (EPOCH + int(time.time() * 1000)) / MSD


def agent_y(z: float, coeff: float, ztp: float) -> float:
    return 0.0 if coeff == 0 else (z - ztp) / coeff


def extract_js_array(name: str, text: str) -> list[Any]:
    match = re.search(rf"const\\s+{name}\\s*=\\s*(\\[.*?\\]);", text, re.S)
    if not match:
        raise RuntimeError(f"Could not find {name} in {GRAPH_SOURCE_PATH}")
    return ast.literal_eval(match.group(1))


def load_graph() -> tuple[list[float], list[list[float]]]:
    text = GRAPH_SOURCE_PATH.read_text()
    node_ys = [float(v) for v in extract_js_array("NODE_YS", text)]
    edges_raw = extract_js_array("EDGES_RAW", text)
    return node_ys, edges_raw


@dataclass
class RuntimeEvent:
    id: str
    ts: float
    z: float
    agent_name: str
    namespace: str
    event_type: str
    node_idx: int
    node_y: float
    node_class: str
    mechanism: str
    message: str
    payload: dict[str, Any]


class StartRequest(BaseModel):
    agent_limit: int = Field(default=64, ge=1, le=790)
    tick_seconds: float = Field(default=2.0, ge=0.25, le=60.0)
    namespaces: Optional[list[str]] = None
    autonomous_kernel: bool = True
    research_agent: bool = False
    research_cycle_every_ticks: int = Field(default=10, ge=1, le=1000)


class DsepRequest(BaseModel):
    node_idx: int = Field(ge=0, le=398)
    conditioned_nodes: list[int] = Field(default_factory=list)


class ObservationRequest(BaseModel):
    agent_name: Optional[str] = None
    namespace: Optional[str] = None
    node_idx: Optional[int] = Field(default=None, ge=0, le=398)
    node_y: Optional[float] = None
    prompt: str = ""
    digest: str = ""
    state: str = "observed"
    keywords: list[str] = Field(default_factory=list)
    source: str = "manual"
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class JudgmentRequest(BaseModel):
    observation_id: Optional[str] = None
    agent_name: Optional[str] = None
    namespace: Optional[str] = None
    node_idx: int = Field(ge=0, le=398)
    state: str = "monitor"
    rationale: str = ""
    judge: str = "human"
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    create_lockin: Optional[bool] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProjectionRequest(BaseModel):
    agent_name: Optional[str] = None
    namespace: Optional[str] = None
    source_idx: int = Field(ge=0, le=398)
    target_idx: int = Field(ge=0, le=398)
    edge_weight: Optional[float] = None
    prompt: str = ""
    digest: str = ""
    policy: str = "manual"
    due_z: Optional[float] = None
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ResolveProjectionRequest(BaseModel):
    resolution_state: str = "confirmed"
    rationale: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class DigestRequest(BaseModel):
    model: Optional[str] = None
    max_tokens: Optional[int] = Field(default=None, ge=1, le=4096)
    system: Optional[str] = None
    prompt: Optional[str] = None
    humanPrompt: Optional[str] = None
    messages: Optional[list[dict[str, Any]]] = None
    context: Optional[dict[str, Any]] = None


class DigestTaskRequest(BaseModel):
    agent_name: Optional[str] = None
    namespace: Optional[str] = None
    node_idx: Optional[int] = Field(default=None, ge=0, le=398)
    trigger: str = "manual"
    priority: int = Field(default=5, ge=1, le=10)
    prompt: str
    context: dict[str, Any] = Field(default_factory=dict)


class SfoWamGraph:
    def __init__(self, node_ys: list[float], edges_raw: list[list[float]]) -> None:
        self.node_ys = node_ys
        self.edges_raw = edges_raw
        self.children: list[list[tuple[int, float]]] = [[] for _ in node_ys]
        self.parents: list[list[tuple[int, float]]] = [[] for _ in node_ys]
        for fi, ti, weight in edges_raw:
            self.children[int(fi)].append((int(ti), float(weight)))
            self.parents[int(ti)].append((int(fi), float(weight)))
        self.node_class = [self._classify(i) for i in range(len(node_ys))]

    def _classify(self, idx: int) -> str:
        indeg = len(self.parents[idx])
        outdeg = len(self.children[idx])
        if indeg >= 2 and outdeg >= 2:
            return "collider_fork"
        if indeg >= 2 and outdeg >= 1:
            return "collider"
        if indeg >= 2:
            return "collider_sink"
        if outdeg >= 2:
            return "fork"
        if indeg == 1 and outdeg == 1:
            return "chain"
        if indeg == 0:
            return "source"
        return "sink"

    def mechanism_for(self, idx: int) -> str:
        cls = self.node_class[idx]
        if cls == "source":
            return "source-initiation"
        if cls == "fork":
            return "fork-propagation"
        if cls == "chain":
            return "chain-transmission"
        if cls.startswith("collider"):
            return "collider-conditioning"
        if cls == "sink":
            return "terminal-absorption"
        return "graph-traversal"

    def nearest_node_index(self, y: float) -> int:
        idx = bisect_right(self.node_ys, y)
        if idx <= 0:
            return 0
        if idx >= len(self.node_ys):
            return len(self.node_ys) - 1
        before = idx - 1
        after = idx
        return before if abs(self.node_ys[before] - y) <= abs(self.node_ys[after] - y) else after

    def enclosing_edge(self, y: float) -> dict[str, Any]:
        idx = bisect_right(self.node_ys, y) - 1
        if idx < 0:
            return {"from_idx": None, "to_idx": 0, "from_y": None, "to_y": self.node_ys[0], "progress": 0.0, "position": "before_graph"}
        if idx >= len(self.node_ys) - 1:
            return {"from_idx": len(self.node_ys) - 1, "to_idx": None, "from_y": self.node_ys[-1], "to_y": None, "progress": 1.0, "position": "after_graph"}
        from_y = self.node_ys[idx]
        to_y = self.node_ys[idx + 1]
        width = to_y - from_y
        progress = 0.0 if width == 0 else max(0.0, min(1.0, (y - from_y) / width))
        return {"from_idx": idx, "to_idx": idx + 1, "from_y": from_y, "to_y": to_y, "progress": progress, "position": "inside_graph"}

    def snapshot(self, agent: dict[str, Any], z: float) -> dict[str, Any]:
        y = agent_y(z, agent["coeff"], agent["ztp"])
        idx = self.nearest_node_index(y)
        incoming = [{"from_idx": pi, "from_y": self.node_ys[pi], "weight": w} for pi, w in self.parents[idx]]
        outgoing = [{"to_idx": ti, "to_y": self.node_ys[ti], "weight": w} for ti, w in self.children[idx]]
        return {
            "name": agent["name"],
            "namespace": agent["ns"],
            "ztp": agent["ztp"],
            "coeff": agent["coeff"],
            "z": z,
            "y": y,
            "node_idx": idx,
            "node_y": self.node_ys[idx],
            "node_class": self.node_class[idx],
            "edge": self.enclosing_edge(y),
            "incoming_count": len(incoming),
            "outgoing_count": len(outgoing),
            "incoming": incoming[:8],
            "outgoing": outgoing[:8],
            "mechanism": self.mechanism_for(idx),
        }

    def d_separation_cascade(self, touched_idx: int, conditioned_nodes: set[int]) -> dict[str, Any]:
        visited: set[str] = set()
        open_nodes: set[int] = set()
        blocked_nodes: set[int] = set()
        paths: list[dict[str, Any]] = []
        queue: list[tuple[int, str, list[int]]] = []
        for ci, _w in self.children[touched_idx]:
            queue.append((ci, "down", [touched_idx, ci]))
        for pi, _w in self.parents[touched_idx]:
            queue.append((pi, "up", [touched_idx, pi]))

        while queue:
            idx, direction, path = queue.pop(0)
            key = f"{idx}:{direction}"
            if key in visited:
                continue
            visited.add(key)
            is_conditioned = idx in conditioned_nodes
            is_collider = self.node_class[idx].startswith("collider")

            if is_collider:
                if is_conditioned:
                    open_nodes.add(idx)
                    paths.append({"path": path, "type": "collider_open"})
                    for pi, _w in self.parents[idx]:
                        if f"{pi}:up" not in visited:
                            queue.append((pi, "up", [*path, pi]))
                    for ci, _w in self.children[idx]:
                        if f"{ci}:down" not in visited:
                            queue.append((ci, "down", [*path, ci]))
                else:
                    blocked_nodes.add(idx)
            else:
                if not is_conditioned:
                    open_nodes.add(idx)
                    paths.append({"path": path, "type": "chain_open" if direction == "down" else "fork_open"})
                    if direction == "down":
                        for ci, _w in self.children[idx]:
                            if f"{ci}:down" not in visited:
                                queue.append((ci, "down", [*path, ci]))
                    else:
                        for pi, _w in self.parents[idx]:
                            if f"{pi}:up" not in visited:
                                queue.append((pi, "up", [*path, pi]))
                    if self.node_class[idx] in {"fork", "collider_fork"}:
                        for ci, _w in self.children[idx]:
                            if f"{ci}:down" not in visited:
                                queue.append((ci, "down", [*path, ci]))
                else:
                    blocked_nodes.add(idx)

        return {
            "touched_idx": touched_idx,
            "conditioned_nodes": sorted(conditioned_nodes),
            "open_nodes": sorted(open_nodes),
            "blocked_nodes": sorted(blocked_nodes),
            "open_count": len(open_nodes),
            "blocked_count": len(blocked_nodes),
            "paths": paths[:100],
        }


NODE_YS, EDGES_RAW = load_graph()
GRAPH = SfoWamGraph(NODE_YS, EDGES_RAW)


class KernelStore:
    def __init__(self, path: Path, graph: SfoWamGraph) -> None:
        self.path = path
        self.graph = graph
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS runtime_events (
                    id TEXT PRIMARY KEY, ts REAL NOT NULL, z REAL NOT NULL,
                    agent_name TEXT NOT NULL, namespace TEXT NOT NULL, event_type TEXT NOT NULL,
                    node_idx INTEGER NOT NULL, node_y REAL NOT NULL, node_class TEXT NOT NULL,
                    mechanism TEXT NOT NULL, message TEXT NOT NULL, payload_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS observations (
                    id TEXT PRIMARY KEY, ts REAL NOT NULL, agent_name TEXT, namespace TEXT,
                    node_idx INTEGER NOT NULL, node_y REAL NOT NULL, prompt TEXT NOT NULL,
                    digest TEXT NOT NULL, state TEXT NOT NULL, keywords_json TEXT NOT NULL,
                    source TEXT NOT NULL, confidence REAL NOT NULL, metadata_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS judgments (
                    id TEXT PRIMARY KEY, ts REAL NOT NULL, observation_id TEXT, agent_name TEXT,
                    namespace TEXT, node_idx INTEGER NOT NULL, node_y REAL NOT NULL, state TEXT NOT NULL,
                    rationale TEXT NOT NULL, judge TEXT NOT NULL, confidence REAL NOT NULL,
                    metadata_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS lockins (
                    id TEXT PRIMARY KEY, ts REAL NOT NULL, judgment_id TEXT, agent_name TEXT,
                    namespace TEXT, node_idx INTEGER NOT NULL, node_y REAL NOT NULL,
                    state TEXT NOT NULL, rationale TEXT NOT NULL, confidence REAL NOT NULL,
                    active INTEGER NOT NULL, metadata_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS projections (
                    id TEXT PRIMARY KEY, ts REAL NOT NULL, agent_name TEXT, namespace TEXT,
                    source_idx INTEGER NOT NULL, source_y REAL NOT NULL, target_idx INTEGER NOT NULL,
                    target_y REAL NOT NULL, edge_weight REAL NOT NULL, prompt TEXT NOT NULL,
                    digest TEXT NOT NULL, policy TEXT NOT NULL, due_z REAL, confidence REAL NOT NULL,
                    resolution_state TEXT, resolved_ts REAL, resolution_rationale TEXT,
                    metadata_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS digest_tasks (
                    id TEXT PRIMARY KEY, ts REAL NOT NULL, agent_name TEXT, namespace TEXT,
                    node_idx INTEGER, node_y REAL, trigger TEXT NOT NULL, priority INTEGER NOT NULL,
                    status TEXT NOT NULL, prompt TEXT NOT NULL, context_json TEXT NOT NULL,
                    result TEXT, error TEXT, completed_ts REAL
                );
                CREATE TABLE IF NOT EXISTS coordination_actions (
                    id TEXT PRIMARY KEY, ts REAL NOT NULL, action_type TEXT NOT NULL,
                    node_idx INTEGER, namespace TEXT, agent_count INTEGER NOT NULL,
                    status TEXT NOT NULL, rationale TEXT NOT NULL, payload_json TEXT NOT NULL
                );
                """
            )
            conn.commit()

    def row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        out = dict(row)
        for key in list(out.keys()):
            if key.endswith("_json"):
                out[key[:-5]] = json.loads(out.pop(key) or "null")
        return out

    def insert_runtime_event(self, event: RuntimeEvent) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO runtime_events
                (id, ts, z, agent_name, namespace, event_type, node_idx, node_y, node_class, mechanism, message, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (event.id, event.ts, event.z, event.agent_name, event.namespace, event.event_type,
                 event.node_idx, event.node_y, event.node_class, event.mechanism, event.message,
                 json.dumps(event.payload)),
            )
            conn.commit()

    def insert_observation(self, req: ObservationRequest) -> dict[str, Any]:
        node_idx = req.node_idx if req.node_idx is not None else self.graph.nearest_node_index(req.node_y or 0.0)
        node_y = self.graph.node_ys[node_idx]
        oid = str(uuid.uuid4())
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO observations
                (id, ts, agent_name, namespace, node_idx, node_y, prompt, digest, state, keywords_json, source, confidence, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (oid, now_ts(), req.agent_name, req.namespace, node_idx, node_y, req.prompt, req.digest,
                 req.state, json.dumps(req.keywords), req.source, req.confidence, json.dumps(req.metadata)),
            )
            conn.commit()
        return self.get_by_id("observations", oid)

    def insert_judgment(self, req: JudgmentRequest) -> dict[str, Any]:
        node_y = self.graph.node_ys[req.node_idx]
        jid = str(uuid.uuid4())
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO judgments
                (id, ts, observation_id, agent_name, namespace, node_idx, node_y, state, rationale, judge, confidence, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (jid, now_ts(), req.observation_id, req.agent_name, req.namespace, req.node_idx, node_y,
                 req.state, req.rationale, req.judge, req.confidence, json.dumps(req.metadata)),
            )
            conn.commit()
        should_lock = req.create_lockin
        if should_lock is None:
            should_lock = req.state.lower() in {"confirmed", "lock-in", "locked", "condition", "conditioned"}
        if should_lock:
            self.insert_lockin(jid, req.agent_name, req.namespace, req.node_idx, req.state, req.rationale, req.confidence, req.metadata)
        return self.get_by_id("judgments", jid)

    def insert_lockin(self, judgment_id: Optional[str], agent_name: Optional[str], namespace: Optional[str], node_idx: int,
                      state: str, rationale: str, confidence: float, metadata: dict[str, Any]) -> dict[str, Any]:
        lid = str(uuid.uuid4())
        node_y = self.graph.node_ys[node_idx]
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO lockins
                (id, ts, judgment_id, agent_name, namespace, node_idx, node_y, state, rationale, confidence, active, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (lid, now_ts(), judgment_id, agent_name, namespace, node_idx, node_y, state, rationale, confidence, json.dumps(metadata)),
            )
            conn.commit()
        return self.get_by_id("lockins", lid)

    def insert_projection(self, req: ProjectionRequest) -> dict[str, Any]:
        pid = str(uuid.uuid4())
        source_y = self.graph.node_ys[req.source_idx]
        target_y = self.graph.node_ys[req.target_idx]
        edge_weight = req.edge_weight if req.edge_weight is not None else abs(target_y - source_y)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO projections
                (id, ts, agent_name, namespace, source_idx, source_y, target_idx, target_y, edge_weight,
                 prompt, digest, policy, due_z, confidence, resolution_state, resolved_ts, resolution_rationale, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
                """,
                (pid, now_ts(), req.agent_name, req.namespace, req.source_idx, source_y, req.target_idx, target_y,
                 edge_weight, req.prompt, req.digest, req.policy, req.due_z, req.confidence, json.dumps(req.metadata)),
            )
            conn.commit()
        return self.get_by_id("projections", pid)

    def resolve_projection(self, projection_id: str, req: ResolveProjectionRequest) -> dict[str, Any]:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE projections
                SET resolution_state = ?, resolved_ts = ?, resolution_rationale = ?, metadata_json = ?
                WHERE id = ?
                """,
                (req.resolution_state, now_ts(), req.rationale, json.dumps(req.metadata), projection_id),
            )
            conn.commit()
        return self.get_by_id("projections", projection_id)

    def insert_digest_task(self, req: DigestTaskRequest, status: str = "queued") -> dict[str, Any]:
        tid = str(uuid.uuid4())
        node_y = self.graph.node_ys[req.node_idx] if req.node_idx is not None else None
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO digest_tasks
                (id, ts, agent_name, namespace, node_idx, node_y, trigger, priority, status, prompt, context_json, result, error, completed_ts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
                """,
                (tid, now_ts(), req.agent_name, req.namespace, req.node_idx, node_y, req.trigger, req.priority,
                 status, req.prompt, json.dumps(req.context)),
            )
            conn.commit()
        return self.get_by_id("digest_tasks", tid)

    def update_digest_task(self, task_id: str, status: str, result: Optional[str], error: Optional[str]) -> dict[str, Any]:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE digest_tasks
                SET status = ?, result = ?, error = ?, completed_ts = ?
                WHERE id = ?
                """,
                (status, result, error, now_ts(), task_id),
            )
            conn.commit()
        return self.get_by_id("digest_tasks", task_id)

    def insert_coordination_action(self, action_type: str, node_idx: Optional[int], namespace: Optional[str],
                                   agent_count: int, rationale: str, payload: dict[str, Any], status: str = "open") -> dict[str, Any]:
        cid = str(uuid.uuid4())
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO coordination_actions
                (id, ts, action_type, node_idx, namespace, agent_count, status, rationale, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (cid, now_ts(), action_type, node_idx, namespace, agent_count, status, rationale, json.dumps(payload)),
            )
            conn.commit()
        return self.get_by_id("coordination_actions", cid)

    def get_by_id(self, table: str, item_id: str) -> dict[str, Any]:
        allowed = {"observations", "judgments", "lockins", "projections", "digest_tasks", "coordination_actions"}
        if table not in allowed:
            raise ValueError(table)
        with self.connect() as conn:
            row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"{table} item not found")
        return self.row_to_dict(row)

    def list_table(self, table: str, limit: int = 50, where: str = "", params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        allowed = {"observations", "judgments", "lockins", "projections", "digest_tasks", "coordination_actions", "runtime_events"}
        if table not in allowed:
            raise ValueError(table)
        limit = max(1, min(limit, 500))
        query = f"SELECT * FROM {table} {where} ORDER BY ts DESC LIMIT ?"
        with self.connect() as conn:
            rows = conn.execute(query, (*params, limit)).fetchall()
        return [self.row_to_dict(row) for row in rows]

    def active_conditioned_nodes(self) -> set[int]:
        with self.connect() as conn:
            rows = conn.execute("SELECT DISTINCT node_idx FROM lockins WHERE active = 1").fetchall()
        return {int(row[0]) for row in rows}

    def counts(self) -> dict[str, int]:
        out = {}
        with self.connect() as conn:
            for table in ["observations", "judgments", "lockins", "projections", "digest_tasks", "coordination_actions", "runtime_events"]:
                out[table] = int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            out["active_lockins"] = int(conn.execute("SELECT COUNT(*) FROM lockins WHERE active = 1").fetchone()[0])
            out["open_projections"] = int(conn.execute("SELECT COUNT(*) FROM projections WHERE resolution_state IS NULL").fetchone()[0])
            out["queued_digest_tasks"] = int(conn.execute("SELECT COUNT(*) FROM digest_tasks WHERE status IN ('queued','deferred_missing_key')").fetchone()[0])
        return out


class CausalKernel:
    def __init__(self, graph: SfoWamGraph, store: KernelStore) -> None:
        self.graph = graph
        self.store = store
        self.last_digest_by_agent_node: dict[str, float] = {}
        self.last_coordination_by_node: dict[int, float] = {}
        self.last_coordination_by_namespace: dict[str, float] = {}

    def ingest_transition_observation(self, snapshot: dict[str, Any], event: RuntimeEvent) -> dict[str, Any]:
        req = ObservationRequest(
            agent_name=snapshot["name"],
            namespace=snapshot["namespace"],
            node_idx=snapshot["node_idx"],
            prompt="Autonomous transition observation",
            digest=event.message,
            state="runtime-observed",
            keywords=[snapshot["mechanism"], snapshot["node_class"]],
            source="runtime-transition",
            confidence=0.65,
            metadata={"event_id": event.id, "edge": snapshot["edge"]},
        )
        return self.store.insert_observation(req)

    def monitor_judgment(self, observation: dict[str, Any], snapshot: dict[str, Any]) -> dict[str, Any]:
        req = JudgmentRequest(
            observation_id=observation["id"],
            agent_name=snapshot["name"],
            namespace=snapshot["namespace"],
            node_idx=snapshot["node_idx"],
            state="monitor",
            rationale="Autonomous runtime recorded the traversal; no lock-in was created without explicit confirmation.",
            judge="kernel-policy",
            confidence=0.5,
            create_lockin=False,
            metadata={"mechanism": snapshot["mechanism"]},
        )
        return self.store.insert_judgment(req)

    def propagate_conditioning(self, node_idx: int) -> dict[str, Any]:
        conditioned = self.store.active_conditioned_nodes()
        return self.graph.d_separation_cascade(node_idx, conditioned)

    def create_outgoing_projections(self, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        projections = []
        for edge in snapshot["outgoing"][:4]:
            req = ProjectionRequest(
                agent_name=snapshot["name"],
                namespace=snapshot["namespace"],
                source_idx=snapshot["node_idx"],
                target_idx=edge["to_idx"],
                edge_weight=edge["weight"],
                prompt="Autonomous projection generated from node transition.",
                digest=(
                    f"If {snapshot['name']} continues from node {snapshot['node_idx']} to {edge['to_idx']}, "
                    f"the active mechanism remains {snapshot['mechanism']} unless conditioning changes."
                ),
                policy="transition-outgoing-edge",
                confidence=0.55,
                metadata={"source_event": "node_transition"},
            )
            projections.append(self.store.insert_projection(req))
        return projections

    def resolve_reached_projections(self, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        open_items = self.store.list_table(
            "projections", 100,
            "WHERE resolution_state IS NULL AND agent_name = ? AND target_idx = ?",
            (snapshot["name"], snapshot["node_idx"]),
        )
        resolved = []
        for item in open_items:
            resolved.append(self.store.resolve_projection(
                item["id"],
                ResolveProjectionRequest(
                    resolution_state="confirmed",
                    rationale="Agent reached the projected target node during autonomous traversal.",
                    metadata={"resolved_by": "runtime_tick"},
                ),
            ))
        return resolved

    def maybe_schedule_digest(self, snapshot: dict[str, Any], dsep: dict[str, Any]) -> Optional[dict[str, Any]]:
        mechanism = snapshot["mechanism"]
        should_trigger = mechanism in {"collider-conditioning", "fork-propagation", "terminal-absorption"} or dsep["blocked_count"] > 0
        if not should_trigger:
            return None
        key = f"{snapshot['name']}:{snapshot['node_idx']}"
        ts = now_ts()
        if ts - self.last_digest_by_agent_node.get(key, 0.0) < 300:
            return None
        self.last_digest_by_agent_node[key] = ts
        status = "queued" if os.environ.get("ANTHROPIC_API_KEY") else "deferred_missing_key"
        req = DigestTaskRequest(
            agent_name=snapshot["name"],
            namespace=snapshot["namespace"],
            node_idx=snapshot["node_idx"],
            trigger=f"mechanism:{mechanism}",
            priority=8 if mechanism == "collider-conditioning" else 6,
            prompt=(
                f"Assess agent {snapshot['name']} at SFO-WAM node {snapshot['node_idx']} "
                f"(Y={snapshot['node_y']}, class={snapshot['node_class']}, mechanism={mechanism}). "
                f"Open nodes={dsep['open_count']}; blocked nodes={dsep['blocked_count']}. "
                "Return a bounded causal digest: structural prior, conditioning state, evidence gap, and recommended next action."
            ),
            context={"snapshot": snapshot, "d_separation": dsep},
        )
        return self.store.insert_digest_task(req, status=status)

    def coordinate(self, snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
        by_node: dict[int, list[dict[str, Any]]] = {}
        by_namespace: dict[str, int] = {}
        for snap in snapshots:
            by_node.setdefault(snap["node_idx"], []).append(snap)
            by_namespace[snap["namespace"]] = by_namespace.get(snap["namespace"], 0) + 1

        actions = []
        ts = now_ts()
        for node_idx, group in by_node.items():
            if len(group) < 3:
                continue
            if ts - self.last_coordination_by_node.get(node_idx, 0.0) < 120:
                continue
            self.last_coordination_by_node[node_idx] = ts
            mechanism = self.graph.mechanism_for(node_idx)
            actions.append(self.store.insert_coordination_action(
                action_type="multi-agent-node-convergence",
                node_idx=node_idx,
                namespace=None,
                agent_count=len(group),
                rationale=(
                    f"{len(group)} tracked agents occupy or nearest-map to node {node_idx}; "
                    f"mechanism={mechanism}. Kernel recommends arbitration before lock-in."
                ),
                payload={
                    "agents": [g["name"] for g in group[:20]],
                    "node_y": self.graph.node_ys[node_idx],
                    "node_class": self.graph.node_class[node_idx],
                    "mechanism": mechanism,
                },
            ))
        for ns, count in by_namespace.items():
            if count < 24:
                continue
            if ts - self.last_coordination_by_namespace.get(ns, 0.0) < 120:
                continue
            self.last_coordination_by_namespace[ns] = ts
            actions.append(self.store.insert_coordination_action(
                action_type="namespace-load-watch",
                node_idx=None,
                namespace=ns,
                agent_count=count,
                status="monitor",
                rationale=f"Namespace {ns} has {count} tracked agents in the current runtime slice.",
                payload={"namespace": ns, "count": count},
            ))
        return actions

    def process_transition(self, snapshot: dict[str, Any], event: RuntimeEvent) -> dict[str, Any]:
        observation = self.ingest_transition_observation(snapshot, event)
        judgment = self.monitor_judgment(observation, snapshot)
        dsep = self.propagate_conditioning(snapshot["node_idx"])
        projections = self.create_outgoing_projections(snapshot)
        resolved = self.resolve_reached_projections(snapshot)
        digest_task = self.maybe_schedule_digest(snapshot, dsep)
        return {
            "observation": observation,
            "judgment": judgment,
            "d_separation": dsep,
            "created_projections": projections,
            "resolved_projections": resolved,
            "digest_task": digest_task,
        }


class RuntimeEngine:
    def __init__(self, graph: SfoWamGraph, store: KernelStore, kernel: CausalKernel, research_agent_service: Optional[Any] = None) -> None:
        self.graph = graph
        self.store = store
        self.kernel = kernel
        self.research_agent_service = research_agent_service
        self.agents = self._load_agents()
        self.running = False
        self.autonomous_kernel = True
        self.research_agent_enabled = False
        self.research_cycle_every_ticks = 10
        self.research_cycles_completed = 0
        self.last_research_cycle_at: Optional[float] = None
        self.last_research_cycle_summary: Optional[dict[str, Any]] = None
        self.tick_seconds = 2.0
        self.agent_limit = 64
        self.namespaces: Optional[list[str]] = None
        self.task: Optional[asyncio.Task[Any]] = None
        self.lock = asyncio.Lock()
        self.last_tick: Optional[float] = None
        self.tick_count = 0
        self.agent_state: dict[str, dict[str, Any]] = {}
        self.events: list[RuntimeEvent] = []
        self.subscribers: set[asyncio.Queue[str]] = set()

    def _load_agents(self) -> list[dict[str, Any]]:
        data = json.loads(REGISTRY_PATH.read_text())
        normalized = []
        for row in data:
            try:
                normalized.append({"name": str(row["name"]), "ns": str(row.get("ns", "unknown")), "ztp": float(row["ztp"]), "coeff": float(row["coeff"])})
            except (KeyError, TypeError, ValueError):
                continue
        return normalized

    def selected_agents(self) -> list[dict[str, Any]]:
        agents = self.agents
        if self.namespaces:
            allowed = set(self.namespaces)
            agents = [a for a in agents if a["ns"] in allowed]
        return agents[: self.agent_limit]

    def event_for_transition(self, snapshot: dict[str, Any], previous: Optional[dict[str, Any]]) -> Optional[RuntimeEvent]:
        if previous and previous.get("node_idx") == snapshot["node_idx"]:
            return None
        event_type = "runtime_initialized" if previous is None else "node_transition"
        message = (
            f"{snapshot['name']} entered node {snapshot['node_idx']} "
            f"(Y={snapshot['node_y']:.4f}, {snapshot['node_class']}); mechanism={snapshot['mechanism']}."
        )
        payload = {
            "previous_node_idx": previous.get("node_idx") if previous else None,
            "previous_node_y": previous.get("node_y") if previous else None,
            "current_edge": snapshot["edge"],
            "incoming_count": snapshot["incoming_count"],
            "outgoing_count": snapshot["outgoing_count"],
            "incoming": snapshot["incoming"],
            "outgoing": snapshot["outgoing"],
        }
        return RuntimeEvent(str(uuid.uuid4()), now_ts(), snapshot["z"], snapshot["name"], snapshot["namespace"], event_type,
                            snapshot["node_idx"], snapshot["node_y"], snapshot["node_class"], snapshot["mechanism"], message, payload)

    async def publish(self, payload: dict[str, Any]) -> None:
        line = f"data: {json.dumps(payload)}\\n\\n"
        dead = []
        for q in self.subscribers:
            try:
                q.put_nowait(line)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.subscribers.discard(q)

    def _maybe_run_research_cycle(self, next_tick_count: int) -> Optional[dict[str, Any]]:
        if not self.research_agent_enabled or not self.research_agent_service:
            return None
        every = max(1, int(self.research_cycle_every_ticks or 10))
        if next_tick_count % every != 0:
            return None
        try:
            result = self.research_agent_service.run_research_cycle(limit=6, autonomous=True)
            self.research_cycles_completed += 1
            self.last_research_cycle_at = now_ts()
            self.last_research_cycle_summary = {
                key: result.get(key)
                for key in [
                    "hypotheses_created",
                    "tests_run",
                    "evidence_scores_updated",
                    "episodes_created",
                    "review_items_created",
                    "digests_created",
                    "warnings",
                    "summary",
                ]
            }
            self.last_research_cycle_summary["ok"] = True
            return self.last_research_cycle_summary
        except Exception as exc:  # pragma: no cover - defensive runtime containment
            self.last_research_cycle_at = now_ts()
            self.last_research_cycle_summary = {"ok": False, "error": str(exc)}
            return self.last_research_cycle_summary

    async def tick_once(self) -> dict[str, Any]:
        async with self.lock:
            z = tnldy_now()
            selected = self.selected_agents()
            new_events: list[RuntimeEvent] = []
            snapshots: list[dict[str, Any]] = []
            kernel_results: list[dict[str, Any]] = []
            for agent in selected:
                snapshot = self.graph.snapshot(agent, z)
                previous = self.agent_state.get(agent["name"])
                event = self.event_for_transition(snapshot, previous)
                self.agent_state[agent["name"]] = snapshot
                snapshots.append(snapshot)
                if event:
                    self.events.append(event)
                    self.events = self.events[-500:]
                    self.store.insert_runtime_event(event)
                    new_events.append(event)
                    if self.autonomous_kernel:
                        kernel_results.append(self.kernel.process_transition(snapshot, event))
            coordination_actions = self.kernel.coordinate(snapshots) if self.autonomous_kernel else []
            self.last_tick = now_ts()
            next_tick_count = self.tick_count + 1
            research_cycle_result = self._maybe_run_research_cycle(next_tick_count)
            self.tick_count = next_tick_count
            payload = {
                "running": self.running,
                "autonomous_kernel": self.autonomous_kernel,
                "research_agent": self.research_agent_enabled,
                "research_cycle_every_ticks": self.research_cycle_every_ticks,
                "research_cycle": research_cycle_result,
                "research_cycles_completed": self.research_cycles_completed,
                "last_research_cycle_at": self.last_research_cycle_at,
                "last_research_cycle_summary": self.last_research_cycle_summary,
                "tick_count": self.tick_count,
                "z": z,
                "tracked_agents": len(selected),
                "graph": {"nodes": len(self.graph.node_ys), "edges": len(self.graph.edges_raw)},
                "events": [asdict(e) for e in new_events[-20:]],
                "sample_agents": snapshots[:16],
                "kernel_results_count": len(kernel_results),
                "coordination_actions": coordination_actions[-10:],
                "kernel_counts": self.store.counts(),
                "last_tick": self.last_tick,
            }
        await self.publish({"type": "tick", **payload})
        return payload

    async def loop(self) -> None:
        while self.running:
            try:
                await self.tick_once()
            except Exception as exc:
                await self.publish({"type": "runtime_error", "error": str(exc), "timestamp": now_ts()})
            await asyncio.sleep(self.tick_seconds)

    async def start(self, req: StartRequest) -> dict[str, Any]:
        self.agent_limit = req.agent_limit
        self.tick_seconds = req.tick_seconds
        self.namespaces = req.namespaces
        self.autonomous_kernel = req.autonomous_kernel
        self.research_agent_enabled = bool(req.research_agent)
        self.research_cycle_every_ticks = max(1, int(req.research_cycle_every_ticks or 10))
        if not self.running:
            self.running = True
            self.task = asyncio.create_task(self.loop())
        return await self.status()

    async def stop(self) -> dict[str, Any]:
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
        return await self.status()

    async def status(self) -> dict[str, Any]:
        async with self.lock:
            selected = self.selected_agents()
            namespaces = sorted({a["ns"] for a in self.agents})
            research_status = None
            if self.research_agent_service:
                try:
                    research_status = self.research_agent_service.status()
                    research_status["research_agent_enabled"] = self.research_agent_enabled
                except Exception as exc:  # pragma: no cover - status should not crash runtime
                    research_status = {"ok": False, "error": str(exc)}
            return {
                "ok": True,
                "service": "jomo-sfo-wam-research-agent-kernel",
                "running": self.running,
                "autonomous_kernel": self.autonomous_kernel,
                "research_agent_enabled": self.research_agent_enabled,
                "research_cycle_every_ticks": self.research_cycle_every_ticks,
                "research_cycles_completed": self.research_cycles_completed,
                "last_research_cycle_at": self.last_research_cycle_at,
                "last_research_cycle_summary": self.last_research_cycle_summary,
                "research_status": research_status,
                "tick_count": self.tick_count,
                "tick_seconds": self.tick_seconds,
                "agent_limit": self.agent_limit,
                "tracked_agents": len(selected),
                "total_agents": len(self.agents),
                "namespaces": namespaces,
                "namespace_filter": self.namespaces,
                "graph": {"nodes": len(self.graph.node_ys), "edges": len(self.graph.edges_raw)},
                "last_tick": self.last_tick,
                "digest_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
                "db_path": str(DB_PATH),
                "kernel_counts": self.store.counts(),
                "recent_events": [asdict(e) for e in self.events[-10:]],
            }


async def call_anthropic(req: DigestRequest):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        message = "Research-agent kernel digest service is running, but ANTHROPIC_API_KEY is not configured."
        return JSONResponse(status_code=503, content={"error": "ANTHROPIC_API_KEY is not configured on the research-agent kernel.", "digest": message, "content": [{"type": "text", "text": message}], "timestamp": now_ts()})
    prompt = req.prompt or req.humanPrompt or json.dumps(req.model_dump(exclude_none=True), indent=2)
    body = {
        "model": req.model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL),
        "max_tokens": req.max_tokens or int(os.environ.get("ANTHROPIC_MAX_TOKENS", "1000")),
        "system": req.system or DEFAULT_SYSTEM,
        "messages": req.messages or [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"Content-Type": "application/json", "x-api-key": api_key, "anthropic-version": os.environ.get("ANTHROPIC_VERSION", "2023-06-01")},
            json=body,
        )
    data = response.json()
    if response.status_code >= 400:
        message = data.get("error", {}).get("message") or data.get("message") or f"Provider returned HTTP {response.status_code}"
        raise HTTPException(status_code=response.status_code, detail=f"Anthropic request failed: {message}")
    text = "\\n".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
    return {**data, "digest": text or "No digest text returned by provider.", "timestamp": now_ts()}


load_local_env()
STORE = KernelStore(DB_PATH, GRAPH)
KERNEL = CausalKernel(GRAPH, STORE)
RESEARCH_AGENT = ResearchAgent(GRAPH, STORE)
ENGINE = RuntimeEngine(GRAPH, STORE, KERNEL, RESEARCH_AGENT)

app = FastAPI(title="JOMO SFO-WAM Research-Agent Kernel", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5177", "http://localhost:5177", "http://127.0.0.1:5176", "http://localhost:5176"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    status = await ENGINE.status()
    return {**status, "model": os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)}


@app.get("/api/kernel/status")
async def kernel_status() -> dict[str, Any]:
    return {"ok": True, "service": "jomo-sfo-wam-research-agent-kernel", "counts": STORE.counts(), "conditioned_nodes": sorted(STORE.active_conditioned_nodes()), "graph": {"nodes": len(GRAPH.node_ys), "edges": len(GRAPH.edges_raw)}}


@app.get("/api/graph/summary")
async def graph_summary() -> dict[str, Any]:
    class_counts: dict[str, int] = {}
    for cls in GRAPH.node_class:
        class_counts[cls] = class_counts.get(cls, 0) + 1
    return {"nodes": len(GRAPH.node_ys), "edges": len(GRAPH.edges_raw), "class_counts": class_counts, "first_y": GRAPH.node_ys[0], "last_y": GRAPH.node_ys[-1]}


@app.get("/api/graph/node/{node_idx}")
async def graph_node(node_idx: int) -> dict[str, Any]:
    if node_idx < 0 or node_idx >= len(GRAPH.node_ys):
        raise HTTPException(status_code=404, detail="Node index out of range")
    return {"idx": node_idx, "y": GRAPH.node_ys[node_idx], "class": GRAPH.node_class[node_idx], "mechanism": GRAPH.mechanism_for(node_idx), "parents": GRAPH.parents[node_idx], "children": GRAPH.children[node_idx]}


@app.post("/api/graph/dsep")
async def graph_dsep(req: DsepRequest) -> dict[str, Any]:
    return GRAPH.d_separation_cascade(req.node_idx, set(req.conditioned_nodes))


@app.post("/api/runtime/start")
async def runtime_start(req: StartRequest) -> dict[str, Any]:
    return await ENGINE.start(req)


@app.post("/api/runtime/stop")
async def runtime_stop() -> dict[str, Any]:
    return await ENGINE.stop()


@app.post("/api/runtime/tick")
async def runtime_tick() -> dict[str, Any]:
    return await ENGINE.tick_once()


@app.get("/api/runtime/status")
async def runtime_status() -> dict[str, Any]:
    return await ENGINE.status()


@app.get("/api/runtime/agents")
async def runtime_agents(limit: int = 50) -> dict[str, Any]:
    z = tnldy_now()
    selected = ENGINE.selected_agents()[: max(1, min(limit, 790))]
    return {"z": z, "agents": [GRAPH.snapshot(a, z) for a in selected]}


@app.get("/api/runtime/events")
async def runtime_events(limit: int = 50) -> dict[str, Any]:
    return {"events": STORE.list_table("runtime_events", limit)}


@app.get("/api/runtime/stream")
async def runtime_stream() -> StreamingResponse:
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=20)
    ENGINE.subscribers.add(queue)

    async def generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'service': 'jomo-sfo-wam-research-agent-kernel'})}\\n\\n"
            while True:
                yield await queue.get()
        finally:
            ENGINE.subscribers.discard(queue)

    return StreamingResponse(generator(), media_type="text/event-stream")


@app.post("/api/observations")
async def create_observation(req: ObservationRequest) -> dict[str, Any]:
    return STORE.insert_observation(req)


@app.get("/api/observations")
async def list_observations(limit: int = 50) -> dict[str, Any]:
    return {"observations": STORE.list_table("observations", limit)}


@app.post("/api/judgments")
async def create_judgment(req: JudgmentRequest) -> dict[str, Any]:
    judgment = STORE.insert_judgment(req)
    dsep = GRAPH.d_separation_cascade(req.node_idx, STORE.active_conditioned_nodes())
    return {"judgment": judgment, "d_separation_after_judgment": dsep}


@app.get("/api/judgments")
async def list_judgments(limit: int = 50) -> dict[str, Any]:
    return {"judgments": STORE.list_table("judgments", limit)}


@app.get("/api/lockins")
async def list_lockins(limit: int = 50, active_only: bool = True) -> dict[str, Any]:
    where = "WHERE active = 1" if active_only else ""
    return {"lockins": STORE.list_table("lockins", limit, where)}


@app.post("/api/projections")
async def create_projection(req: ProjectionRequest) -> dict[str, Any]:
    return STORE.insert_projection(req)


@app.get("/api/projections")
async def list_projections(limit: int = 50, open_only: bool = False) -> dict[str, Any]:
    where = "WHERE resolution_state IS NULL" if open_only else ""
    return {"projections": STORE.list_table("projections", limit, where)}


@app.post("/api/projections/{projection_id}/resolve")
async def resolve_projection(projection_id: str, req: ResolveProjectionRequest) -> dict[str, Any]:
    return STORE.resolve_projection(projection_id, req)


@app.post("/api/digest/tasks")
async def create_digest_task(req: DigestTaskRequest) -> dict[str, Any]:
    status = "queued" if os.environ.get("ANTHROPIC_API_KEY") else "deferred_missing_key"
    return STORE.insert_digest_task(req, status=status)


@app.get("/api/digest/tasks")
async def list_digest_tasks(limit: int = 50) -> dict[str, Any]:
    return {"digest_tasks": STORE.list_table("digest_tasks", limit)}


@app.post("/api/digest/tasks/{task_id}/run")
async def run_digest_task(task_id: str) -> dict[str, Any]:
    task = STORE.get_by_id("digest_tasks", task_id)
    result = await call_anthropic(DigestRequest(prompt=task["prompt"], context=task.get("context")))
    if isinstance(result, JSONResponse):
        STORE.update_digest_task(task_id, "deferred_missing_key", None, "ANTHROPIC_API_KEY is not configured")
        return task
    updated = STORE.update_digest_task(task_id, "completed", result.get("digest"), None)
    return {"task": updated, "provider_response": result}


@app.get("/api/coordination/summary")
async def coordination_summary(limit: int = 50) -> dict[str, Any]:
    return {"coordination_actions": STORE.list_table("coordination_actions", limit), "counts": STORE.counts()}


def research_item_or_404(key: str, item_id: int | str) -> dict[str, Any]:
    try:
        return RESEARCH_AGENT.store.get(key, item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/research/status")
async def research_status() -> dict[str, Any]:
    status = RESEARCH_AGENT.status()
    status["research_agent_enabled"] = ENGINE.research_agent_enabled
    return status


@app.post("/api/research/cycle/run")
async def run_research_cycle(req: RunResearchCycleRequest) -> dict[str, Any]:
    result = RESEARCH_AGENT.run_research_cycle(limit=req.limit, autonomous=req.autonomous)
    ENGINE.last_research_cycle_at = now_ts()
    ENGINE.last_research_cycle_summary = {
        key: result.get(key)
        for key in [
            "hypotheses_created",
            "tests_run",
            "evidence_scores_updated",
            "episodes_created",
            "review_items_created",
            "digests_created",
            "warnings",
            "summary",
        ]
    }
    ENGINE.last_research_cycle_summary["ok"] = True
    return result


@app.get("/api/research/goals")
async def list_research_goals(limit: int = 50, status: Optional[str] = None) -> dict[str, Any]:
    return {"goals": RESEARCH_AGENT.store.list_items("goals", limit, status)}


@app.post("/api/research/goals")
async def create_research_goal(req: ResearchGoalRequest) -> dict[str, Any]:
    return RESEARCH_AGENT.store.create_goal(req)


@app.get("/api/research/goals/{goal_id}")
async def get_research_goal(goal_id: int) -> dict[str, Any]:
    return research_item_or_404("goals", goal_id)


@app.patch("/api/research/goals/{goal_id}")
async def patch_research_goal(goal_id: int, patch: dict[str, Any]) -> dict[str, Any]:
    return RESEARCH_AGENT.store.patch_item("goals", goal_id, patch)


@app.get("/api/research/hypotheses")
async def list_research_hypotheses(limit: int = 50, status: Optional[str] = None) -> dict[str, Any]:
    return {"hypotheses": RESEARCH_AGENT.store.list_items("hypotheses", limit, status)}


@app.post("/api/research/hypotheses")
async def create_research_hypothesis(req: ResearchHypothesisRequest) -> dict[str, Any]:
    return RESEARCH_AGENT.store.create_hypothesis(req)


@app.get("/api/research/hypotheses/{hypothesis_id}")
async def get_research_hypothesis(hypothesis_id: int) -> dict[str, Any]:
    return research_item_or_404("hypotheses", hypothesis_id)


@app.patch("/api/research/hypotheses/{hypothesis_id}")
async def patch_research_hypothesis(hypothesis_id: int, patch: dict[str, Any]) -> dict[str, Any]:
    return RESEARCH_AGENT.store.patch_item("hypotheses", hypothesis_id, patch)


@app.post("/api/research/tests/run")
async def run_research_test(req: RunResearchTestRequest) -> dict[str, Any]:
    return RESEARCH_AGENT.run_test(req)


@app.get("/api/research/tests")
async def list_research_tests(limit: int = 50, status: Optional[str] = None) -> dict[str, Any]:
    return {"tests": RESEARCH_AGENT.store.list_items("tests", limit, status)}


@app.get("/api/research/tests/{test_id}")
async def get_research_test(test_id: int) -> dict[str, Any]:
    return research_item_or_404("tests", test_id)


@app.get("/api/research/evidence-scores")
async def list_evidence_scores(limit: int = 50) -> dict[str, Any]:
    return {"evidence_scores": RESEARCH_AGENT.store.list_items("scores", limit)}


@app.get("/api/research/evidence-scores/{score_id}")
async def get_evidence_score(score_id: int) -> dict[str, Any]:
    return research_item_or_404("scores", score_id)


@app.get("/api/research/episodes")
async def list_research_episodes(limit: int = 50, status: Optional[str] = None) -> dict[str, Any]:
    return {"episodes": RESEARCH_AGENT.store.list_items("episodes", limit, status)}


@app.post("/api/research/episodes")
async def create_research_episode(req: ResearchEpisodeRequest) -> dict[str, Any]:
    return RESEARCH_AGENT.store.create_episode(req)


@app.get("/api/research/episodes/{episode_id}")
async def get_research_episode(episode_id: int) -> dict[str, Any]:
    return research_item_or_404("episodes", episode_id)


@app.get("/api/research/policy-rules")
async def list_policy_rules(limit: int = 50) -> dict[str, Any]:
    return {"policy_rules": RESEARCH_AGENT.store.list_items("rules", limit)}


@app.post("/api/research/policy-rules")
async def create_policy_rule(req: PolicyRuleRequest) -> dict[str, Any]:
    return RESEARCH_AGENT.store.create_policy_rule(req)


@app.patch("/api/research/policy-rules/{rule_id}")
async def patch_policy_rule(rule_id: int, patch: dict[str, Any]) -> dict[str, Any]:
    return RESEARCH_AGENT.store.patch_item("rules", rule_id, patch)


@app.get("/api/research/review-queue")
async def list_review_queue(limit: int = 50, status: Optional[str] = None) -> dict[str, Any]:
    return {"review_items": RESEARCH_AGENT.store.list_items("reviews", limit, status)}


@app.post("/api/research/review-queue")
async def create_review_item(req: HumanReviewItemRequest) -> dict[str, Any]:
    return RESEARCH_AGENT.store.create_review(req)


@app.post("/api/research/review-queue/{review_id}/resolve")
async def resolve_review_item(review_id: int, req: ResolveReviewRequest) -> dict[str, Any]:
    try:
        return RESEARCH_AGENT.store.resolve_review(review_id, req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/research/digests")
async def list_research_digests(limit: int = 50) -> dict[str, Any]:
    return {"digests": RESEARCH_AGENT.store.list_items("digests", limit)}


@app.post("/api/research/digests/generate")
async def generate_research_digest(req: GenerateDigestRequest) -> dict[str, Any]:
    return RESEARCH_AGENT.generate_digest(req)


@app.get("/api/research/digests/{digest_id}")
async def get_research_digest(digest_id: int) -> dict[str, Any]:
    return research_item_or_404("digests", digest_id)


@app.post("/api/forge")
async def forge_agent(payload: dict[str, Any]) -> dict[str, Any]:
    name = payload.get("name")
    ns = payload.get("ns")
    ztp = payload.get("ztp")
    coeff = payload.get("coeff")
    if not name or not ns or ztp is None or coeff is None:
        raise HTTPException(status_code=400, detail="Missing required fields: name, ns, ztp, coeff")
    registry = json.loads(REGISTRY_PATH.read_text())
    if any(row.get("name") == name for row in registry):
        raise HTTPException(status_code=409, detail=f'Agent name "{name}" already exists in registry')
    new_agent = {"name": str(name), "ns": str(ns), "ztp": float(ztp), "coeff": float(coeff)}
    registry.append(new_agent)
    REGISTRY_PATH.write_text(json.dumps(registry, indent=2))
    ENGINE.agents.append(new_agent)
    return {"success": True, "agent": new_agent}


@app.post("/api/digest")
async def digest(req: DigestRequest):
    return await call_anthropic(req)
`,S=`from __future__ import annotations

import json
import math
import os
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def json_text(value: Any) -> str:
    return json.dumps(value if value is not None else {}, sort_keys=True)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


class ResearchGoalRequest(BaseModel):
    title: str
    description: str = ""
    priority: int = Field(default=5, ge=1, le=10)
    status: str = "active"
    created_by: str = "research_agent"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ResearchHypothesisRequest(BaseModel):
    goal_id: Optional[int] = None
    title: str
    claim: str
    hypothesis_type: str
    node_idx: Optional[int] = Field(default=None, ge=0, le=398)
    source_node_idx: Optional[int] = Field(default=None, ge=0, le=398)
    target_node_idx: Optional[int] = Field(default=None, ge=0, le=398)
    namespace: Optional[str] = None
    status: str = "open"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    created_by: str = "research_agent"
    metadata: dict[str, Any] = Field(default_factory=dict)


class RunResearchTestRequest(BaseModel):
    test_type: str
    hypothesis_id: Optional[int] = None
    input: dict[str, Any] = Field(default_factory=dict)
    title: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ResearchEpisodeRequest(BaseModel):
    title: str
    question: str
    summary: str = ""
    goal_id: Optional[int] = None
    hypothesis_id: Optional[int] = None
    status: str = "open"
    conclusion: str = ""
    evidence: dict[str, Any] = Field(default_factory=dict)
    tests: dict[str, Any] = Field(default_factory=dict)
    next_actions: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PolicyRuleRequest(BaseModel):
    name: str
    description: str = ""
    rule_type: str
    condition: dict[str, Any] = Field(default_factory=dict)
    action: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    priority: int = Field(default=5, ge=1, le=10)
    metadata: dict[str, Any] = Field(default_factory=dict)


class HumanReviewItemRequest(BaseModel):
    item_type: str
    item_id: str
    title: str
    rationale: str = ""
    priority: int = Field(default=5, ge=1, le=10)
    status: str = "open"
    proposed_action: str = "human_review"
    reviewer: Optional[str] = None
    resolution: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ResolveReviewRequest(BaseModel):
    status: str
    reviewer: str = "human"
    resolution: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class GenerateDigestRequest(BaseModel):
    digest_type: str = "daily_kernel_digest"
    title: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RunResearchCycleRequest(BaseModel):
    limit: int = Field(default=10, ge=1, le=50)
    autonomous: bool = False


class ResearchStore:
    tables = {
        "goals": "research_goals",
        "hypotheses": "research_hypotheses",
        "tests": "research_tests",
        "scores": "evidence_scores",
        "episodes": "research_episodes",
        "rules": "policy_rules",
        "reviews": "human_review_items",
        "digests": "research_digests",
    }

    order_columns = {
        "research_goals": "updated_at",
        "research_hypotheses": "updated_at",
        "research_tests": "created_at",
        "evidence_scores": "updated_at",
        "research_episodes": "updated_at",
        "policy_rules": "updated_at",
        "human_review_items": "created_at",
        "research_digests": "created_at",
    }

    def __init__(self, kernel_store: Any, graph: Any) -> None:
        self.kernel_store = kernel_store
        self.graph = graph
        self.init_schema()
        self.seed_defaults()

    def connect(self):
        return self.kernel_store.connect()

    def init_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS research_goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    priority INTEGER DEFAULT 5,
                    status TEXT DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    created_by TEXT DEFAULT 'research_agent',
                    metadata_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_research_goals_status ON research_goals(status);

                CREATE TABLE IF NOT EXISTS research_hypotheses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    goal_id INTEGER,
                    title TEXT NOT NULL,
                    claim TEXT NOT NULL,
                    hypothesis_type TEXT NOT NULL,
                    node_idx INTEGER,
                    source_node_idx INTEGER,
                    target_node_idx INTEGER,
                    namespace TEXT,
                    status TEXT DEFAULT 'open',
                    confidence REAL DEFAULT 0.0,
                    evidence_score_id INTEGER,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    created_by TEXT DEFAULT 'research_agent',
                    metadata_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_research_hypotheses_status ON research_hypotheses(status);
                CREATE INDEX IF NOT EXISTS idx_research_hypotheses_type ON research_hypotheses(hypothesis_type);
                CREATE INDEX IF NOT EXISTS idx_research_hypotheses_node ON research_hypotheses(node_idx);

                CREATE TABLE IF NOT EXISTS research_tests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    hypothesis_id INTEGER,
                    test_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    input_json TEXT DEFAULT '{}',
                    result_json TEXT DEFAULT '{}',
                    status TEXT DEFAULT 'pending',
                    started_at TEXT,
                    finished_at TEXT,
                    created_at TEXT NOT NULL,
                    metadata_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_research_tests_status ON research_tests(status);
                CREATE INDEX IF NOT EXISTS idx_research_tests_type ON research_tests(test_type);
                CREATE INDEX IF NOT EXISTS idx_research_tests_hypothesis ON research_tests(hypothesis_id);

                CREATE TABLE IF NOT EXISTS evidence_scores (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject_type TEXT NOT NULL,
                    subject_id TEXT NOT NULL,
                    support_count INTEGER DEFAULT 0,
                    contradiction_count INTEGER DEFAULT 0,
                    projection_hit_count INTEGER DEFAULT 0,
                    projection_miss_count INTEGER DEFAULT 0,
                    projection_hit_rate REAL DEFAULT 0.0,
                    path_stability_score REAL DEFAULT 0.0,
                    agent_agreement_score REAL DEFAULT 0.0,
                    time_persistence_score REAL DEFAULT 0.0,
                    human_confirmation_level INTEGER DEFAULT 0,
                    overall_score REAL DEFAULT 0.0,
                    confidence_label TEXT DEFAULT 'insufficient',
                    updated_at TEXT NOT NULL,
                    metadata_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_evidence_scores_subject ON evidence_scores(subject_type, subject_id);
                CREATE INDEX IF NOT EXISTS idx_evidence_scores_label ON evidence_scores(confidence_label);

                CREATE TABLE IF NOT EXISTS research_episodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    question TEXT NOT NULL,
                    summary TEXT,
                    goal_id INTEGER,
                    hypothesis_id INTEGER,
                    status TEXT DEFAULT 'open',
                    conclusion TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    evidence_json TEXT DEFAULT '{}',
                    tests_json TEXT DEFAULT '{}',
                    next_actions_json TEXT DEFAULT '{}',
                    metadata_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_research_episodes_status ON research_episodes(status);

                CREATE TABLE IF NOT EXISTS policy_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    rule_type TEXT NOT NULL,
                    condition_json TEXT DEFAULT '{}',
                    action_json TEXT DEFAULT '{}',
                    enabled INTEGER DEFAULT 1,
                    priority INTEGER DEFAULT 5,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    metadata_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_policy_rules_type ON policy_rules(rule_type);
                CREATE INDEX IF NOT EXISTS idx_policy_rules_enabled ON policy_rules(enabled);

                CREATE TABLE IF NOT EXISTS human_review_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_type TEXT NOT NULL,
                    item_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    rationale TEXT,
                    priority INTEGER DEFAULT 5,
                    status TEXT DEFAULT 'open',
                    proposed_action TEXT,
                    reviewer TEXT,
                    resolution TEXT,
                    created_at TEXT NOT NULL,
                    resolved_at TEXT,
                    metadata_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_human_review_items_status ON human_review_items(status);

                CREATE TABLE IF NOT EXISTS research_digests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    digest_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    period_start TEXT,
                    period_end TEXT,
                    created_at TEXT NOT NULL,
                    generated_by TEXT DEFAULT 'research_agent',
                    source_json TEXT DEFAULT '{}',
                    metadata_json TEXT DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_research_digests_type ON research_digests(digest_type);
                CREATE INDEX IF NOT EXISTS idx_research_digests_created ON research_digests(created_at);
                """
            )
            conn.commit()

    def seed_defaults(self) -> None:
        with self.connect() as conn:
            goal_count = conn.execute("SELECT COUNT(*) FROM research_goals").fetchone()[0]
            rule_count = conn.execute("SELECT COUNT(*) FROM policy_rules").fetchone()[0]
        if goal_count == 0:
            for goal in [
                ("Test whether active lock-ins preserve SFO-WAM admissibility.", "Compare active lock-ins against d-separation changes and governance thresholds.", 10),
                ("Detect unstable causal regions in the 399-node graph.", "Find nodes with repeated observations, blocked paths, or coordination convergence.", 8),
                ("Compare projected transitions against observed transitions.", "Measure projection resolution, unresolved projections, and likely misses.", 8),
                ("Identify nodes requiring human review.", "Escalate strong machine evidence without canonical promotion.", 9),
                ("Produce periodic research digests.", "Summarize hypotheses, tests, evidence, and review items locally or through backend-safe model calls.", 6),
            ]:
                self.create_goal(ResearchGoalRequest(title=goal[0], description=goal[1], priority=goal[2], created_by="seed"))
        if rule_count == 0:
            rules = [
                ("No canonical promotion without human review.", "Machine evidence cannot create canonical SFO-WAM baseline status.", "human_review_escalation", {"any_machine_claim": True}, {"canonical_promotion": False, "review_required": True}, 10),
                ("Strong machine evidence creates human review.", "Strong evidence creates a review item, not automatic canonical lock-in.", "lockin_promotion", {"confidence_label": ["strong", "human_confirmed"]}, {"create_review_item": True}, 9),
                ("Repeated projection failure becomes a hypothesis.", "Unresolved or missed projections schedule tests instead of immediate rejection.", "projection_failure", {"projection_hit_rate_lt": 0.35}, {"create_hypothesis": True, "create_test": True}, 7),
                ("Namespace overload creates coordination review.", "Heavy namespace concentration is reviewed as evidence concentration.", "namespace_overload", {"namespace_share_gt": 0.5}, {"create_review_item": True}, 7),
                ("Active lock-in changes require d-separation audit.", "Conditioning changes must be auditable through before/after d-separation comparison.", "lockin_promotion", {"active_lockins_gt": 0}, {"run_test": "dsep_before_after_lockin"}, 8),
                ("Digest backlog creates digest-backlog hypothesis.", "Accumulating digest tasks should generate a backlog hypothesis and digest.", "digest_escalation", {"queued_digest_tasks_gt": 10}, {"create_hypothesis": True, "create_digest": True}, 5),
            ]
            for name, desc, rule_type, condition, action, priority in rules:
                self.create_policy_rule(PolicyRuleRequest(name=name, description=desc, rule_type=rule_type, condition=condition, action=action, priority=priority, metadata={"seed": True}))

    def row_to_dict(self, row) -> dict[str, Any]:
        out = dict(row)
        for key in list(out.keys()):
            if key.endswith("_json"):
                raw = out.pop(key)
                try:
                    out[key[:-5]] = json.loads(raw or "{}")
                except json.JSONDecodeError:
                    out[key[:-5]] = raw
        if "enabled" in out:
            out["enabled"] = bool(out["enabled"])
        return out

    def get(self, key: str, item_id: int | str) -> dict[str, Any]:
        table = self.tables[key]
        with self.connect() as conn:
            row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,)).fetchone()
        if row is None:
            raise KeyError(f"{key} item not found: {item_id}")
        return self.row_to_dict(row)

    def list_items(self, key: str, limit: int = 50, status: Optional[str] = None) -> list[dict[str, Any]]:
        table = self.tables[key]
        limit = max(1, min(int(limit), 500))
        where = ""
        params: tuple[Any, ...] = ()
        if status:
            where = "WHERE status = ?"
            params = (status,)
        order_by = self.order_columns[table]
        with self.connect() as conn:
            rows = conn.execute(f"SELECT * FROM {table} {where} ORDER BY {order_by} DESC, id DESC LIMIT ?", (*params, limit)).fetchall()
        return [self.row_to_dict(row) for row in rows]

    def create_goal(self, req: ResearchGoalRequest) -> dict[str, Any]:
        ts = utc_now()
        with self.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO research_goals (title, description, priority, status, created_at, updated_at, created_by, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (req.title, req.description, req.priority, req.status, ts, ts, req.created_by, json_text(req.metadata)),
            )
            conn.commit()
            return self.get("goals", cur.lastrowid)

    def create_hypothesis(self, req: ResearchHypothesisRequest) -> dict[str, Any]:
        ts = utc_now()
        with self.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO research_hypotheses
                (goal_id, title, claim, hypothesis_type, node_idx, source_node_idx, target_node_idx, namespace,
                 status, confidence, evidence_score_id, created_at, updated_at, created_by, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
                """,
                (req.goal_id, req.title, req.claim, req.hypothesis_type, req.node_idx, req.source_node_idx,
                 req.target_node_idx, req.namespace, req.status, req.confidence, ts, ts, req.created_by, json_text(req.metadata)),
            )
            conn.commit()
            return self.get("hypotheses", cur.lastrowid)

    def ensure_hypothesis(self, req: ResearchHypothesisRequest) -> dict[str, Any]:
        clauses = ["title = ?", "hypothesis_type = ?"]
        params: list[Any] = [req.title, req.hypothesis_type]
        if req.node_idx is None:
            clauses.append("node_idx IS NULL")
        else:
            clauses.append("node_idx = ?")
            params.append(req.node_idx)
        if req.namespace is None:
            clauses.append("namespace IS NULL")
        else:
            clauses.append("namespace = ?")
            params.append(req.namespace)
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM research_hypotheses WHERE " + " AND ".join(clauses) + " ORDER BY id DESC LIMIT 1", tuple(params)).fetchone()
        if row:
            return self.row_to_dict(row)
        return self.create_hypothesis(req)

    def create_test(self, hypothesis_id: Optional[int], test_type: str, title: str, input_data: dict[str, Any], result: dict[str, Any], status: str = "completed", metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        ts = utc_now()
        with self.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO research_tests (hypothesis_id, test_type, title, input_json, result_json, status, started_at, finished_at, created_at, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (hypothesis_id, test_type, title, json_text(input_data), json_text(result), status, ts, ts if status == "completed" else None, ts, json_text(metadata or {})),
            )
            conn.commit()
            return self.get("tests", cur.lastrowid)

    def create_score(self, subject_type: str, subject_id: str, components: dict[str, Any], metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        with self.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO evidence_scores
                (subject_type, subject_id, support_count, contradiction_count, projection_hit_count, projection_miss_count,
                 projection_hit_rate, path_stability_score, agent_agreement_score, time_persistence_score,
                 human_confirmation_level, overall_score, confidence_label, updated_at, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    subject_type, str(subject_id), int(components.get("support_count", 0)), int(components.get("contradiction_count", 0)),
                    int(components.get("projection_hit_count", 0)), int(components.get("projection_miss_count", 0)),
                    float(components.get("projection_hit_rate", 0.0)), float(components.get("path_stability_score", 0.0)),
                    float(components.get("agent_agreement_score", 0.0)), float(components.get("time_persistence_score", 0.0)),
                    int(components.get("human_confirmation_level", 0)), float(components.get("overall_score", 0.0)),
                    str(components.get("confidence_label", "insufficient")), utc_now(), json_text(metadata or {}),
                ),
            )
            conn.commit()
            return self.get("scores", cur.lastrowid)

    def update_hypothesis_score(self, hypothesis_id: int, score: dict[str, Any]) -> dict[str, Any]:
        label = score.get("confidence_label", "insufficient")
        status = "needs_human_review" if label in {"moderate", "strong", "human_confirmed"} else "open"
        with self.connect() as conn:
            conn.execute(
                "UPDATE research_hypotheses SET evidence_score_id = ?, confidence = ?, status = ?, updated_at = ? WHERE id = ?",
                (score["id"], score.get("overall_score", 0.0), status, utc_now(), hypothesis_id),
            )
            conn.commit()
        return self.get("hypotheses", hypothesis_id)

    def create_episode(self, req: ResearchEpisodeRequest) -> dict[str, Any]:
        ts = utc_now()
        with self.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO research_episodes
                (title, question, summary, goal_id, hypothesis_id, status, conclusion, created_at, updated_at,
                 evidence_json, tests_json, next_actions_json, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (req.title, req.question, req.summary, req.goal_id, req.hypothesis_id, req.status, req.conclusion,
                 ts, ts, json_text(req.evidence), json_text(req.tests), json_text(req.next_actions), json_text(req.metadata)),
            )
            conn.commit()
            return self.get("episodes", cur.lastrowid)

    def create_policy_rule(self, req: PolicyRuleRequest) -> dict[str, Any]:
        ts = utc_now()
        with self.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO policy_rules (name, description, rule_type, condition_json, action_json, enabled, priority, created_at, updated_at, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (req.name, req.description, req.rule_type, json_text(req.condition), json_text(req.action), 1 if req.enabled else 0, req.priority, ts, ts, json_text(req.metadata)),
            )
            conn.commit()
            return self.get("rules", cur.lastrowid)

    def create_review(self, req: HumanReviewItemRequest) -> dict[str, Any]:
        with self.connect() as conn:
            existing = conn.execute("SELECT * FROM human_review_items WHERE item_type = ? AND item_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1", (req.item_type, str(req.item_id))).fetchone()
            if existing:
                return self.row_to_dict(existing)
            cur = conn.execute(
                """
                INSERT INTO human_review_items
                (item_type, item_id, title, rationale, priority, status, proposed_action, reviewer, resolution, created_at, resolved_at, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
                """,
                (req.item_type, str(req.item_id), req.title, req.rationale, req.priority, req.status, req.proposed_action, req.reviewer, req.resolution, utc_now(), json_text(req.metadata)),
            )
            conn.commit()
            return self.get("reviews", cur.lastrowid)

    def resolve_review(self, review_id: int, req: ResolveReviewRequest) -> dict[str, Any]:
        if req.status not in {"approved", "rejected", "deferred"}:
            raise ValueError("review status must be approved, rejected, or deferred")
        with self.connect() as conn:
            conn.execute(
                "UPDATE human_review_items SET status = ?, reviewer = ?, resolution = ?, resolved_at = ?, metadata_json = ? WHERE id = ?",
                (req.status, req.reviewer, req.resolution, utc_now(), json_text(req.metadata), review_id),
            )
            conn.commit()
        return self.get("reviews", review_id)

    def create_digest(self, digest_type: str, title: str, body: str, source: dict[str, Any], period_start: Optional[str] = None, period_end: Optional[str] = None, generated_by: str = "research_agent", metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        with self.connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO research_digests (digest_type, title, body, period_start, period_end, created_at, generated_by, source_json, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (digest_type, title, body, period_start, period_end, utc_now(), generated_by, json_text(source), json_text(metadata or {})),
            )
            conn.commit()
            return self.get("digests", cur.lastrowid)

    def patch_item(self, key: str, item_id: int, patch: dict[str, Any]) -> dict[str, Any]:
        table = self.tables[key]
        allowed = {
            "goals": {"title", "description", "priority", "status", "created_by", "metadata"},
            "hypotheses": {"goal_id", "title", "claim", "hypothesis_type", "node_idx", "source_node_idx", "target_node_idx", "namespace", "status", "confidence", "evidence_score_id", "created_by", "metadata"},
            "rules": {"name", "description", "rule_type", "condition", "action", "enabled", "priority", "metadata"},
        }.get(key, set())
        updates: list[str] = []
        values: list[Any] = []
        for raw_key, value in patch.items():
            if raw_key not in allowed:
                continue
            column = raw_key
            if raw_key in {"metadata", "condition", "action"}:
                column = f"{raw_key}_json"
                value = json_text(value)
            if raw_key == "enabled":
                value = 1 if value else 0
            updates.append(f"{column} = ?")
            values.append(value)
        if table in {"research_goals", "research_hypotheses", "policy_rules"}:
            updates.append("updated_at = ?")
            values.append(utc_now())
        if updates:
            values.append(item_id)
            with self.connect() as conn:
                conn.execute(f"UPDATE {table} SET {', '.join(updates)} WHERE id = ?", tuple(values))
                conn.commit()
        return self.get(key, item_id)

    def status(self, last_cycle_summary: Optional[dict[str, Any]] = None, enabled: bool = True) -> dict[str, Any]:
        with self.connect() as conn:
            scalar = lambda sql, params=(): int(conn.execute(sql, params).fetchone()[0])
            label_rows = conn.execute("SELECT confidence_label, COUNT(*) FROM evidence_scores GROUP BY confidence_label").fetchall()
            latest_digest = conn.execute("SELECT * FROM research_digests ORDER BY created_at DESC, id DESC LIMIT 1").fetchone()
            return {
                "service": "jomo-sfo-wam-research-agent-kernel",
                "research_agent_enabled": enabled,
                "goals_total": scalar("SELECT COUNT(*) FROM research_goals"),
                "active_goals": scalar("SELECT COUNT(*) FROM research_goals WHERE status = 'active'"),
                "open_hypotheses": scalar("SELECT COUNT(*) FROM research_hypotheses WHERE status IN ('open','needs_human_review')"),
                "tests_total": scalar("SELECT COUNT(*) FROM research_tests"),
                "tests_recent": scalar("SELECT COUNT(*) FROM research_tests WHERE created_at >= datetime('now','-1 day')"),
                "evidence_scores_total": scalar("SELECT COUNT(*) FROM evidence_scores"),
                "confidence_label_counts": {row[0]: int(row[1]) for row in label_rows},
                "open_review_items": scalar("SELECT COUNT(*) FROM human_review_items WHERE status = 'open'"),
                "digests_total": scalar("SELECT COUNT(*) FROM research_digests"),
                "latest_digest": self.row_to_dict(latest_digest) if latest_digest else None,
                "active_policy_rules": scalar("SELECT COUNT(*) FROM policy_rules WHERE enabled = 1"),
                "last_research_cycle_summary": last_cycle_summary,
            }


class ResearchPlanner:
    def __init__(self, store: ResearchStore, kernel_store: Any, graph: Any) -> None:
        self.store = store
        self.kernel_store = kernel_store
        self.graph = graph

    def _first_goal_id(self, title_word: str = "") -> Optional[int]:
        goals = self.store.list_items("goals", 100)
        for goal in goals:
            if title_word.lower() and title_word.lower() in goal["title"].lower():
                return int(goal["id"])
        return int(goals[-1]["id"]) if goals else None

    def plan(self, limit: int = 10) -> list[dict[str, Any]]:
        plans: list[dict[str, Any]] = []
        active_lockins = self.kernel_store.list_table("lockins", 100, "WHERE active = 1")
        for lockin in active_lockins[:3]:
            node_idx = int(lockin["node_idx"])
            hyp = self.store.ensure_hypothesis(ResearchHypothesisRequest(
                goal_id=self._first_goal_id("lock"),
                title=f"Active lock-in at node {node_idx} changes d-separation state",
                claim=f"Node {node_idx} is an active conditioned node and must be audited before stronger promotion.",
                hypothesis_type="dsep_change",
                node_idx=node_idx,
                metadata={"lockin_id": lockin["id"]},
            ))
            plans.append({"hypothesis": hyp, "test_type": "dsep_before_after_lockin", "input": {"node_idx": node_idx}})

        projections = self.kernel_store.list_table("projections", 500)
        if projections:
            source_counts = Counter(int(p["source_idx"]) for p in projections)
            source_idx, total = source_counts.most_common(1)[0]
            open_count = sum(1 for p in projections if int(p["source_idx"]) == source_idx and not p.get("resolution_state"))
            resolved_count = sum(1 for p in projections if int(p["source_idx"]) == source_idx and p.get("resolution_state") == "confirmed")
            htype = "projection_failure" if open_count >= max(5, resolved_count * 2) else "projection_accuracy"
            hyp = self.store.ensure_hypothesis(ResearchHypothesisRequest(
                goal_id=self._first_goal_id("projected"),
                title=f"Projection behavior from node {source_idx} requires audit",
                claim=f"Node {source_idx} has {total} recorded projections, {resolved_count} confirmed and {open_count} open.",
                hypothesis_type=htype,
                node_idx=source_idx,
                source_node_idx=source_idx,
                metadata={"projection_count": total, "open_count": open_count, "resolved_count": resolved_count},
            ))
            plans.append({"hypothesis": hyp, "test_type": "projection_accuracy", "input": {"source_idx": source_idx}})

        coordination = self.kernel_store.list_table("coordination_actions", 500)
        node_actions = [a for a in coordination if a.get("action_type") == "multi-agent-node-convergence" and a.get("node_idx") is not None]
        if node_actions:
            node_idx, count = Counter(int(a["node_idx"]) for a in node_actions).most_common(1)[0]
            hyp = self.store.ensure_hypothesis(ResearchHypothesisRequest(
                goal_id=self._first_goal_id("human"),
                title=f"Repeated agent convergence at node {node_idx} requires arbitration",
                claim=f"Node {node_idx} appears in {count} multi-agent convergence actions.",
                hypothesis_type="coordination_convergence",
                node_idx=node_idx,
                metadata={"coordination_count": count},
            ))
            plans.append({"hypothesis": hyp, "test_type": "coordination_convergence", "input": {"node_idx": node_idx}})

        ns_actions = [a for a in coordination if a.get("namespace")]
        observations = self.kernel_store.list_table("observations", 500)
        ns_counts = Counter((o.get("namespace") or "unknown") for o in observations)
        if ns_actions or ns_counts:
            namespace, count = (Counter(str(a["namespace"]) for a in ns_actions).most_common(1)[0] if ns_actions else ns_counts.most_common(1)[0])
            hyp = self.store.ensure_hypothesis(ResearchHypothesisRequest(
                goal_id=self._first_goal_id("unstable"),
                title=f"Namespace {namespace} may be overloaded in runtime evidence",
                claim=f"Namespace {namespace} dominates recent observations or coordination actions.",
                hypothesis_type="namespace_load",
                namespace=namespace,
                metadata={"observed_count": count},
            ))
            plans.append({"hypothesis": hyp, "test_type": "namespace_load", "input": {"namespace": namespace}})

        if observations:
            node_idx, count = Counter(int(o["node_idx"]) for o in observations).most_common(1)[0]
            hyp = self.store.ensure_hypothesis(ResearchHypothesisRequest(
                goal_id=self._first_goal_id("unstable"),
                title=f"Node {node_idx} has repeated observations and should be tested for stability",
                claim=f"Node {node_idx} appears in {count} recent observations.",
                hypothesis_type="node_stability",
                node_idx=node_idx,
                metadata={"observation_count": count},
            ))
            plans.append({"hypothesis": hyp, "test_type": "node_stability", "input": {"node_idx": node_idx}})

        digest_tasks = self.kernel_store.list_table("digest_tasks", 500)
        backlog = [t for t in digest_tasks if t.get("status") in {"queued", "deferred_missing_key"}]
        if backlog:
            hyp = self.store.ensure_hypothesis(ResearchHypothesisRequest(
                goal_id=self._first_goal_id("digest"),
                title="Digest backlog requires research-agent summarization",
                claim=f"There are {len(backlog)} queued or deferred digest tasks.",
                hypothesis_type="digest_backlog",
                metadata={"backlog_count": len(backlog)},
            ))
            plans.append({"hypothesis": hyp, "test_type": "blocked_path_frequency", "input": {}})

        for test_type in ["collider_frequency", "fork_frequency", "terminal_node_recurrence"]:
            if len(plans) >= limit:
                break
            hyp = self.store.ensure_hypothesis(ResearchHypothesisRequest(
                goal_id=self._first_goal_id("unstable"),
                title=f"{test_type.replace('_', ' ').title()} should be monitored",
                claim=f"The research agent should track {test_type.replace('_', ' ')} without changing graph structure.",
                hypothesis_type=test_type,
            ))
            plans.append({"hypothesis": hyp, "test_type": test_type, "input": {}})
        return plans[:limit]


class ResearchTester:
    def __init__(self, store: ResearchStore, kernel_store: Any, graph: Any) -> None:
        self.store = store
        self.kernel_store = kernel_store
        self.graph = graph

    def run(self, req: RunResearchTestRequest) -> dict[str, Any]:
        fn = getattr(self, f"test_{req.test_type}", None)
        if not fn:
            result = {"interpretation": f"Unknown test type: {req.test_type}", "support_count": 0, "contradiction_count": 1}
            status = "failed"
        else:
            result = fn(req.input)
            status = "completed"
        return self.store.create_test(req.hypothesis_id, req.test_type, req.title or result.get("title") or req.test_type, req.input, result, status, req.metadata)

    def test_dsep_before_after_lockin(self, input_data: dict[str, Any]) -> dict[str, Any]:
        active = self.kernel_store.list_table("lockins", 200, "WHERE active = 1")
        conditioned = {int(row["node_idx"]) for row in active}
        node_idx = int(input_data.get("node_idx") or (next(iter(conditioned)) if conditioned else 0))
        baseline = self.graph.d_separation_cascade(node_idx, set())
        current = self.graph.d_separation_cascade(node_idx, conditioned)
        changed_nodes = (set(baseline["open_nodes"]) ^ set(current["open_nodes"])) | (set(baseline["blocked_nodes"]) ^ set(current["blocked_nodes"]))
        changed_denominator = max(1, len(set(baseline["open_nodes"]) | set(current["open_nodes"]) | set(baseline["blocked_nodes"]) | set(current["blocked_nodes"])))
        return {
            "title": "dsep_before_after_lockin",
            "node_idx": node_idx,
            "conditioned_nodes": sorted(conditioned),
            "open_paths_count": current["open_count"],
            "blocked_paths_count": current["blocked_count"],
            "baseline_open_paths_count": baseline["open_count"],
            "baseline_blocked_paths_count": baseline["blocked_count"],
            "changed_paths_count": len(changed_nodes),
            "interpretation": f"Active lock-in conditioning changes {len(changed_nodes)} open/blocked node memberships relative to no-lockin baseline.",
            "support_count": len(changed_nodes),
            "path_stability_score": clamp(1 - len(changed_nodes) / changed_denominator),
            "human_confirmation_level": 2 if conditioned else 0,
        }

    def test_projection_accuracy(self, input_data: dict[str, Any]) -> dict[str, Any]:
        source_idx = input_data.get("source_idx") or input_data.get("node_idx")
        where = "WHERE source_idx = ?" if source_idx is not None else ""
        params = (int(source_idx),) if source_idx is not None else ()
        projections = self.kernel_store.list_table("projections", 500, where, params)
        hits = [p for p in projections if p.get("resolution_state") == "confirmed"]
        misses = [p for p in projections if p.get("resolution_state") and p.get("resolution_state") != "confirmed"]
        open_items = [p for p in projections if not p.get("resolution_state")]
        likely_missed = [p for p in open_items if p.get("due_z") is not None]
        resolved = len(hits) + len(misses)
        hit_rate = len(hits) / resolved if resolved else 0.0
        return {
            "title": "projection_accuracy",
            "source_idx": source_idx,
            "total_projections": len(projections),
            "resolved_projections": resolved,
            "open_projections": len(open_items),
            "expired_or_likely_missed_projections": len(likely_missed),
            "projection_hit_rate": hit_rate,
            "interpretation": f"{len(hits)} confirmed hits, {len(misses)} misses, {len(open_items)} open projections.",
            "support_count": len(hits),
            "contradiction_count": len(misses) + len(likely_missed),
            "projection_hit_count": len(hits),
            "projection_miss_count": len(misses) + len(likely_missed),
            "agent_agreement_score": clamp(len(hits) / max(1, len(projections))),
            "time_persistence_score": clamp(resolved / max(1, len(projections))),
        }

    def test_node_stability(self, input_data: dict[str, Any]) -> dict[str, Any]:
        node_idx = int(input_data.get("node_idx", 0))
        observations = [o for o in self.kernel_store.list_table("observations", 500) if int(o["node_idx"]) == node_idx]
        judgments = [j for j in self.kernel_store.list_table("judgments", 500) if int(j["node_idx"]) == node_idx]
        confirmed = [j for j in judgments if str(j.get("state", "")).lower() in {"confirmed", "locked", "lock-in", "conditioned"}]
        active_lockins = [l for l in self.kernel_store.list_table("lockins", 500, "WHERE active = 1") if int(l["node_idx"]) == node_idx]
        stability_score = clamp((len(observations) / 20) * 0.35 + (len(judgments) / 20) * 0.2 + (len(confirmed) / 5) * 0.2 + (len(active_lockins) / 3) * 0.25)
        return {
            "title": "node_stability",
            "node_idx": node_idx,
            "observations_count": len(observations),
            "judgments_count": len(judgments),
            "confirmed_judgments_count": len(confirmed),
            "active_lockins_count": len(active_lockins),
            "stability_score": stability_score,
            "interpretation": f"Node {node_idx} has {len(observations)} observations, {len(judgments)} judgments, {len(confirmed)} confirmed judgments, and {len(active_lockins)} active lock-ins.",
            "support_count": len(observations) + len(confirmed) + len(active_lockins),
            "contradiction_count": 0,
            "path_stability_score": stability_score,
            "human_confirmation_level": min(4, len(confirmed) + len(active_lockins)),
        }

    def test_namespace_load(self, input_data: dict[str, Any]) -> dict[str, Any]:
        namespace = input_data.get("namespace")
        events = self.kernel_store.list_table("runtime_events", 500)
        observations = self.kernel_store.list_table("observations", 500)
        counts = Counter([e.get("namespace") or "unknown" for e in events] + [o.get("namespace") or "unknown" for o in observations])
        total = sum(counts.values())
        if namespace is None and counts:
            namespace = counts.most_common(1)[0][0]
        count = counts.get(namespace, 0)
        share = count / total if total else 0.0
        return {
            "title": "namespace_load",
            "namespace": namespace,
            "namespace_events_or_observations": count,
            "total_events_or_observations": total,
            "namespace_share": share,
            "interpretation": f"Namespace {namespace} accounts for {share:.1%} of recent event/observation evidence.",
            "support_count": count if share >= 0.5 else 0,
            "contradiction_count": max(0, total - count) if share < 0.5 else 0,
            "agent_agreement_score": clamp(share),
            "time_persistence_score": clamp(count / 50),
        }

    def test_blocked_path_frequency(self, input_data: dict[str, Any]) -> dict[str, Any]:
        tasks = self.kernel_store.list_table("digest_tasks", 500)
        blocked_counts = [int(((t.get("context") or {}).get("d_separation") or {}).get("blocked_count", 0) or 0) for t in tasks]
        blocked_events = sum(1 for n in blocked_counts if n > 0)
        frequency = blocked_events / len(blocked_counts) if blocked_counts else 0.0
        return {
            "title": "blocked_path_frequency",
            "digest_task_count": len(tasks),
            "blocked_path_events": blocked_events,
            "blocked_paths_total": sum(blocked_counts),
            "blocked_path_frequency": frequency,
            "interpretation": f"{blocked_events} of {len(tasks)} digest contexts contain blocked paths.",
            "support_count": blocked_events,
            "contradiction_count": max(0, len(tasks) - blocked_events),
            "path_stability_score": clamp(1 - frequency),
            "time_persistence_score": clamp(blocked_events / 20),
        }

    def _mechanism_frequency(self, label: str, mechanism_prefix: str) -> dict[str, Any]:
        events = self.kernel_store.list_table("runtime_events", 500)
        matches = [e for e in events if str(e.get("node_class", "")).startswith(mechanism_prefix) or str(e.get("mechanism", "")).startswith(mechanism_prefix)]
        share = len(matches) / len(events) if events else 0.0
        return {
            "title": label,
            "runtime_event_count": len(events),
            "matching_event_count": len(matches),
            "matching_share": share,
            "interpretation": f"{len(matches)} of {len(events)} runtime events match {label}.",
            "support_count": len(matches),
            "contradiction_count": max(0, len(events) - len(matches)),
            "agent_agreement_score": clamp(share),
            "time_persistence_score": clamp(len(matches) / 20),
        }

    def test_collider_frequency(self, input_data: dict[str, Any]) -> dict[str, Any]:
        return self._mechanism_frequency("collider_frequency", "collider")

    def test_fork_frequency(self, input_data: dict[str, Any]) -> dict[str, Any]:
        return self._mechanism_frequency("fork_frequency", "fork")

    def test_terminal_node_recurrence(self, input_data: dict[str, Any]) -> dict[str, Any]:
        events = self.kernel_store.list_table("runtime_events", 500)
        matches = [e for e in events if e.get("node_class") == "sink" or e.get("mechanism") == "terminal-absorption"]
        share = len(matches) / len(events) if events else 0.0
        return {
            "title": "terminal_node_recurrence",
            "runtime_event_count": len(events),
            "terminal_node_events": len(matches),
            "terminal_share": share,
            "interpretation": f"{len(matches)} of {len(events)} runtime events are terminal-node events.",
            "support_count": len(matches),
            "contradiction_count": max(0, len(events) - len(matches)),
            "path_stability_score": clamp(1 - share),
        }

    def test_coordination_convergence(self, input_data: dict[str, Any]) -> dict[str, Any]:
        node_idx = input_data.get("node_idx")
        actions = [a for a in self.kernel_store.list_table("coordination_actions", 500) if a.get("action_type") == "multi-agent-node-convergence"]
        if node_idx is not None:
            actions = [a for a in actions if a.get("node_idx") == int(node_idx)]
        agent_count = sum(int(a.get("agent_count") or 0) for a in actions)
        agreement = clamp(agent_count / max(1, len(actions) * 10)) if actions else 0.0
        return {
            "title": "coordination_convergence",
            "node_idx": node_idx,
            "coordination_actions_count": len(actions),
            "total_agent_participations": agent_count,
            "interpretation": f"{len(actions)} convergence actions represent {agent_count} agent participations.",
            "support_count": len(actions),
            "contradiction_count": 0 if actions else 1,
            "agent_agreement_score": agreement,
            "time_persistence_score": clamp(len(actions) / 10),
        }


class EvidenceScorer:
    def __init__(self, store: ResearchStore) -> None:
        self.store = store

    def score_subject(self, subject_type: str, subject_id: str, result: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        result = result or {}
        support = int(result.get("support_count", 0) or 0)
        contradiction = int(result.get("contradiction_count", 0) or 0)
        hit = int(result.get("projection_hit_count", 0) or 0)
        miss = int(result.get("projection_miss_count", 0) or 0)
        hit_rate = float(result.get("projection_hit_rate", hit / max(1, hit + miss)) or 0.0)
        path_stability = float(result.get("path_stability_score", result.get("stability_score", 0.0)) or 0.0)
        agreement = float(result.get("agent_agreement_score", 0.0) or 0.0)
        persistence = float(result.get("time_persistence_score", 0.0) or 0.0)
        human = int(result.get("human_confirmation_level", 0) or 0)
        support_norm = clamp(math.log1p(max(0, support)) / math.log(51))
        contradiction_norm = clamp(math.log1p(max(0, contradiction)) / math.log(51))
        human_norm = clamp(human / 5)
        overall = clamp(0.28 * support_norm - 0.18 * contradiction_norm + 0.18 * hit_rate + 0.16 * path_stability + 0.14 * agreement + 0.14 * persistence + 0.22 * human_norm)
        if human >= 4:
            label = "human_confirmed"
        elif support + hit <= 0 and human <= 0:
            label = "insufficient"
        elif overall >= 0.70:
            label = "strong"
        elif overall >= 0.45:
            label = "moderate"
        elif overall >= 0.20:
            label = "weak"
        else:
            label = "insufficient"
        return self.store.create_score(subject_type, subject_id, {
            "support_count": support,
            "contradiction_count": contradiction,
            "projection_hit_count": hit,
            "projection_miss_count": miss,
            "projection_hit_rate": clamp(hit_rate),
            "path_stability_score": clamp(path_stability),
            "agent_agreement_score": clamp(agreement),
            "time_persistence_score": clamp(persistence),
            "human_confirmation_level": human,
            "overall_score": overall,
            "confidence_label": label,
        }, metadata={"scoring_policy": "deterministic-conservative-v1", "source_result": result})

    def score_hypothesis(self, hypothesis_id: int) -> dict[str, Any]:
        tests = self.store.list_items("tests", 200)
        related = [t for t in tests if t.get("hypothesis_id") == hypothesis_id]
        aggregate = Counter()
        for test in related:
            result = test.get("result") or {}
            for key in ["support_count", "contradiction_count", "projection_hit_count", "projection_miss_count"]:
                aggregate[key] += int(result.get(key, 0) or 0)
            for key in ["projection_hit_rate", "path_stability_score", "agent_agreement_score", "time_persistence_score"]:
                aggregate[key] += float(result.get(key, 0.0) or 0.0)
            aggregate["human_confirmation_level"] = max(aggregate["human_confirmation_level"], int(result.get("human_confirmation_level", 0) or 0))
        if related:
            for key in ["projection_hit_rate", "path_stability_score", "agent_agreement_score", "time_persistence_score"]:
                aggregate[key] /= len(related)
        score = self.score_subject("hypothesis", str(hypothesis_id), dict(aggregate))
        self.store.update_hypothesis_score(hypothesis_id, score)
        return score


class GovernancePolicyEngine:
    def __init__(self, store: ResearchStore) -> None:
        self.store = store

    def evaluate(self, hypothesis: Optional[dict[str, Any]], test: dict[str, Any], score: dict[str, Any]) -> Optional[dict[str, Any]]:
        label = score.get("confidence_label", "insufficient")
        result = test.get("result") or {}
        must_review = label in {"moderate", "strong", "human_confirmed"}
        must_review = must_review or test.get("test_type") in {"dsep_before_after_lockin", "coordination_convergence"}
        must_review = must_review or int(result.get("projection_miss_count", 0) or 0) >= 3
        if not must_review:
            return None
        item_id = str(hypothesis["id"] if hypothesis else test["id"])
        title = hypothesis["title"] if hypothesis else test["title"]
        proposed = "review_for_provisional_lockin_candidate" if label in {"moderate", "strong", "human_confirmed"} else "inspect_research_signal"
        return self.store.create_review(HumanReviewItemRequest(
            item_type="hypothesis" if hypothesis else "research_test",
            item_id=item_id,
            title=f"Human review: {title}",
            rationale=f"Evidence label={label}, score={float(score.get('overall_score', 0.0)):.3f}. Machine may recommend; human governance is required for promotion.",
            priority=8 if label in {"strong", "human_confirmed"} else 6,
            proposed_action=proposed,
            metadata={"test_id": test["id"], "evidence_score_id": score["id"], "governance_level": 3},
        ))


class ResearchDigestWriter:
    def __init__(self, store: ResearchStore) -> None:
        self.store = store

    def generate(self, req: GenerateDigestRequest, status: dict[str, Any]) -> dict[str, Any]:
        hypotheses = self.store.list_items("hypotheses", 6)
        tests = self.store.list_items("tests", 6)
        reviews = self.store.list_items("reviews", 6, status="open")
        scores = self.store.list_items("scores", 6)
        title = req.title or req.digest_type.replace("_", " ").title()
        lines = [
            f"Research digest: {title}",
            "",
            f"Goals total: {status['goals_total']} | active: {status['active_goals']}",
            f"Open hypotheses: {status['open_hypotheses']}",
            f"Tests total: {status['tests_total']} | evidence scores: {status['evidence_scores_total']}",
            f"Open human-review items: {status['open_review_items']}",
            f"Active policy rules: {status['active_policy_rules']}",
            "",
            "Recent hypotheses:",
        ]
        lines.extend([f"- {h['title']} [{h['status']}; confidence={float(h.get('confidence') or 0):.3f}]" for h in hypotheses] or ["- None recorded."])
        lines.append("")
        lines.append("Recent tests:")
        lines.extend([f"- {t['test_type']}: {(t.get('result') or {}).get('interpretation', t['status'])}" for t in tests] or ["- None recorded."])
        lines.append("")
        lines.append("Evidence labels:")
        lines.extend([f"- {s['subject_type']}:{s['subject_id']} -> {s['confidence_label']} ({float(s['overall_score']):.3f})" for s in scores] or ["- None recorded."])
        lines.append("")
        lines.append("Human review queue:")
        lines.extend([f"- {r['title']} -> {r.get('proposed_action') or 'review'}" for r in reviews] or ["- No open review items."])
        lines.append("")
        lines.append("Governance: this digest is deterministic and does not promote canonical SFO-WAM baseline status.")
        generated_by = "research_agent_local_digest" if not os.environ.get("ANTHROPIC_API_KEY") else "research_agent_backend_safe_digest"
        return self.store.create_digest(req.digest_type, title, "\\n".join(lines), {
            "status": status,
            "hypothesis_ids": [h["id"] for h in hypotheses],
            "test_ids": [t["id"] for t in tests],
            "review_ids": [r["id"] for r in reviews],
        }, req.period_start, req.period_end, generated_by, req.metadata)


class ResearchAgent:
    def __init__(self, graph: Any, kernel_store: Any) -> None:
        self.graph = graph
        self.kernel_store = kernel_store
        self.store = ResearchStore(kernel_store, graph)
        self.planner = ResearchPlanner(self.store, kernel_store, graph)
        self.tester = ResearchTester(self.store, kernel_store, graph)
        self.scorer = EvidenceScorer(self.store)
        self.governance = GovernancePolicyEngine(self.store)
        self.digest_writer = ResearchDigestWriter(self.store)
        self.enabled = True
        self.last_cycle_summary: Optional[dict[str, Any]] = None

    def status(self) -> dict[str, Any]:
        return self.store.status(self.last_cycle_summary, self.enabled)

    def run_research_cycle(self, limit: int = 10, autonomous: bool = False) -> dict[str, Any]:
        warnings: list[str] = []
        plans = self.planner.plan(limit)
        hypotheses_by_id: dict[int, dict[str, Any]] = {}
        tests: list[dict[str, Any]] = []
        scores: list[dict[str, Any]] = []
        reviews_by_id: dict[int, dict[str, Any]] = {}
        for plan in plans:
            hyp = plan.get("hypothesis")
            if hyp:
                hypotheses_by_id[int(hyp["id"])] = hyp
            test = self.tester.run(RunResearchTestRequest(
                test_type=plan["test_type"],
                hypothesis_id=int(hyp["id"]) if hyp else None,
                input=plan.get("input", {}),
                metadata={"autonomous": autonomous, "planned_by": "research_planner"},
            ))
            tests.append(test)
            score = self.scorer.score_subject("hypothesis" if hyp else "research_test", str(hyp["id"] if hyp else test["id"]), test.get("result") or {})
            scores.append(score)
            if hyp:
                self.store.update_hypothesis_score(int(hyp["id"]), score)
            review = self.governance.evaluate(hyp, test, score)
            if review:
                reviews_by_id[int(review["id"])] = review
        episode = self.store.create_episode(ResearchEpisodeRequest(
            title="Autonomous research cycle" if autonomous else "Manual research cycle",
            question="Which current SFO-WAM runtime evidence requires hypothesis testing, scoring, or human review?",
            summary=f"Ran {len(tests)} bounded tests across {len(hypotheses_by_id)} distinct hypotheses and opened/reused {len(reviews_by_id)} review items.",
            status="completed",
            conclusion="Machine research cycle completed; canonical promotion remains human-governed.",
            evidence={"hypothesis_ids": list(hypotheses_by_id.keys()), "score_ids": [s["id"] for s in scores]},
            tests={"test_ids": [t["id"] for t in tests], "test_types": [t["test_type"] for t in tests]},
            next_actions={"review_item_ids": list(reviews_by_id.keys())},
            metadata={"autonomous": autonomous, "limit": limit},
        ))
        digest = None
        if autonomous and tests:
            digest = self.generate_digest(GenerateDigestRequest(digest_type="daily_kernel_digest"))
        self.last_cycle_summary = {
            "at": utc_now(),
            "autonomous": autonomous,
            "hypotheses_created": len(hypotheses_by_id),
            "tests_run": len(tests),
            "evidence_scores_updated": len(scores),
            "episodes_created": 1,
            "review_items_created": len(reviews_by_id),
            "digests_created": 1 if digest else 0,
            "warnings": warnings,
            "summary": f"Research cycle completed with {len(tests)} tests and {len(reviews_by_id)} review items.",
        }
        return {**self.last_cycle_summary, "episode": episode, "digest": digest, "status": self.status()}

    def run_test(self, req: RunResearchTestRequest) -> dict[str, Any]:
        test = self.tester.run(req)
        score = self.scorer.score_subject("hypothesis" if req.hypothesis_id else "research_test", str(req.hypothesis_id or test["id"]), test.get("result") or {})
        hyp = self.store.get("hypotheses", req.hypothesis_id) if req.hypothesis_id else None
        if req.hypothesis_id:
            self.store.update_hypothesis_score(req.hypothesis_id, score)
        review = self.governance.evaluate(hyp, test, score)
        return {"test": test, "evidence_score": score, "review_item": review}

    def generate_digest(self, req: GenerateDigestRequest) -> dict[str, Any]:
        return self.digest_writer.generate(req, self.status())
`,A=`[
  {
    "name": "10p8",
    "ns": "sfo00",
    "ztp": 15240.0,
    "coeff": 100.0
  },
  {
    "name": "11p1",
    "ns": "sfo00",
    "ztp": 15278.13,
    "coeff": 100.0
  },
  {
    "name": "11p5",
    "ns": "sfo00",
    "ztp": 15314.7,
    "coeff": 100.0
  },
  {
    "name": "11p8",
    "ns": "sfo00",
    "ztp": 15344.57,
    "coeff": 100.0
  },
  {
    "name": "12p4",
    "ns": "sfo00",
    "ztp": 15401.0,
    "coeff": 100.0
  },
  {
    "name": "12p6",
    "ns": "sfo00",
    "ztp": 15420.0,
    "coeff": 100.0
  },
  {
    "name": "12p7",
    "ns": "sfo00",
    "ztp": 15438.0,
    "coeff": 100.0
  },
  {
    "name": "12p9",
    "ns": "sfo00",
    "ztp": 15450.0,
    "coeff": 100.0
  },
  {
    "name": "13p3",
    "ns": "sfo00",
    "ztp": 15495.0,
    "coeff": 100.0
  },
  {
    "name": "13p6",
    "ns": "sfo00",
    "ztp": 15519.9,
    "coeff": 100.0
  },
  {
    "name": "13p8",
    "ns": "sfo00",
    "ztp": 15543.4,
    "coeff": 100.0
  },
  {
    "name": "13p9",
    "ns": "sfo00",
    "ztp": 15555.4,
    "coeff": 100.0
  },
  {
    "name": "14p5",
    "ns": "sfo00",
    "ztp": 15614.0,
    "coeff": 100.0
  },
  {
    "name": "14p9",
    "ns": "sfo00",
    "ztp": 15659.0,
    "coeff": 100.0
  },
  {
    "name": "15p1",
    "ns": "sfo00",
    "ztp": 15672.8,
    "coeff": 100.0
  },
  {
    "name": "16p9",
    "ns": "sfo00",
    "ztp": 15851.8,
    "coeff": 100.0
  },
  {
    "name": "18p5",
    "ns": "sfo00",
    "ztp": 16010.0,
    "coeff": 100.0
  },
  {
    "name": "18p6",
    "ns": "sfo00",
    "ztp": 16019.0,
    "coeff": 100.0
  },
  {
    "name": "18p7",
    "ns": "sfo00",
    "ztp": 16032.8,
    "coeff": 100.0
  },
  {
    "name": "19p3",
    "ns": "sfo00",
    "ztp": 16092.0,
    "coeff": 100.0
  },
  {
    "name": "19p4",
    "ns": "sfo00",
    "ztp": 16100.0,
    "coeff": 100.0
  },
  {
    "name": "19p5",
    "ns": "sfo00",
    "ztp": 16112.0,
    "coeff": 100.0
  },
  {
    "name": "19p7",
    "ns": "sfo00",
    "ztp": 16132.0,
    "coeff": 100.0
  },
  {
    "name": "20p5",
    "ns": "sfo00",
    "ztp": 16211.8,
    "coeff": 100.0
  },
  {
    "name": "23p2",
    "ns": "sfo00",
    "ztp": 16482.0,
    "coeff": 100.0
  },
  {
    "name": "23p4",
    "ns": "sfo00",
    "ztp": 16501.0,
    "coeff": 100.0
  },
  {
    "name": "23p5",
    "ns": "sfo00",
    "ztp": 16511.0,
    "coeff": 100.0
  },
  {
    "name": "23p7",
    "ns": "sfo00",
    "ztp": 16531.0,
    "coeff": 100.0
  },
  {
    "name": "24p3",
    "ns": "sfo00",
    "ztp": 16589.0,
    "coeff": 100.0
  },
  {
    "name": "24p4",
    "ns": "sfo00",
    "ztp": 16601.0,
    "coeff": 100.0
  },
  {
    "name": "24p9",
    "ns": "sfo00",
    "ztp": 16649.7,
    "coeff": 100.0
  },
  {
    "name": "25p2",
    "ns": "sfo00",
    "ztp": 16680.0,
    "coeff": 100.0
  },
  {
    "name": "25p5",
    "ns": "sfo00",
    "ztp": 16716.5,
    "coeff": 100.0
  },
  {
    "name": "25p7",
    "ns": "sfo00",
    "ztp": 16737.0,
    "coeff": 100.0
  },
  {
    "name": "25p9",
    "ns": "sfo00",
    "ztp": 16752.8,
    "coeff": 100.0
  },
  {
    "name": "26p8",
    "ns": "sfo00",
    "ztp": 16841.0,
    "coeff": 100.0
  },
  {
    "name": "27p0",
    "ns": "sfo00",
    "ztp": 16861.0,
    "coeff": 100.0
  },
  {
    "name": "27p3",
    "ns": "sfo00",
    "ztp": 16891.0,
    "coeff": 100.0
  },
  {
    "name": "27p4",
    "ns": "sfo00",
    "ztp": 16901.0,
    "coeff": 100.0
  },
  {
    "name": "27p7",
    "ns": "sfo00",
    "ztp": 16931.8,
    "coeff": 100.0
  },
  {
    "name": "28p7",
    "ns": "sfo00",
    "ztp": 17030.0,
    "coeff": 100.0
  },
  {
    "name": "28p8",
    "ns": "sfo00",
    "ztp": 17040.0,
    "coeff": 100.0
  },
  {
    "name": "29p2",
    "ns": "sfo00",
    "ztp": 17081.7,
    "coeff": 100.0
  },
  {
    "name": "29p5",
    "ns": "sfo00",
    "ztp": 17112.8,
    "coeff": 100.0
  },
  {
    "name": "30p5",
    "ns": "sfo00",
    "ztp": 17213.0,
    "coeff": 100.0
  },
  {
    "name": "30p6",
    "ns": "sfo00",
    "ztp": 17223.0,
    "coeff": 100.0
  },
  {
    "name": "32p6",
    "ns": "sfo00",
    "ztp": 17428.0,
    "coeff": 100.0
  },
  {
    "name": "33p1",
    "ns": "sfo00",
    "ztp": 17472.8,
    "coeff": 100.0
  },
  {
    "name": "35p5",
    "ns": "sfo00",
    "ztp": 17717.0,
    "coeff": 100.0
  },
  {
    "name": "36p7",
    "ns": "sfo00",
    "ztp": 17832.8,
    "coeff": 100.0
  },
  {
    "name": "38p1",
    "ns": "sfo00",
    "ztp": 17972.8,
    "coeff": 100.0
  },
  {
    "name": "38p3",
    "ns": "sfo00",
    "ztp": 17994.782608695652,
    "coeff": 100.0
  },
  {
    "name": "38p5",
    "ns": "sfo00",
    "ztp": 18011.8,
    "coeff": 100.0
  },
  {
    "name": "39p1",
    "ns": "sfo00",
    "ztp": 18073.0,
    "coeff": 100.0
  },
  {
    "name": "39p8",
    "ns": "sfo00",
    "ztp": 18141.0,
    "coeff": 100.0
  },
  {
    "name": "3p65",
    "ns": "sfo00",
    "ztp": 14525.0,
    "coeff": 100.0
  },
  {
    "name": "40p1",
    "ns": "sfo00",
    "ztp": 18178.0,
    "coeff": 100.0
  },
  {
    "name": "46p8",
    "ns": "sfo00",
    "ztp": 18840.0,
    "coeff": 100.0
  },
  {
    "name": "67p6",
    "ns": "sfo00",
    "ztp": 20928.0,
    "coeff": 100.0
  },
  {
    "name": "85p3",
    "ns": "sfo00",
    "ztp": 22692.0,
    "coeff": 100.0
  },
  {
    "name": "87p8",
    "ns": "sfo00",
    "ztp": 22944.0,
    "coeff": 100.0
  },
  {
    "name": "gods-great-army-microscale-lightcone-of-the-last-end-of-babylon-the-great",
    "ns": "sfo00",
    "ztp": 25590.0,
    "coeff": 23.0
  },
  {
    "name": "last-end-of-mystery-babylon-the-great-with-microscale-precision",
    "ns": "sfo00",
    "ztp": -865540.0,
    "coeff": 48.3
  },
  {
    "name": "m112",
    "ns": "sfo00",
    "ztp": 13040.0,
    "coeff": 100.0
  },
  {
    "name": "m129",
    "ns": "sfo00",
    "ztp": 12864.0,
    "coeff": 100.0
  },
  {
    "name": "m13p",
    "ns": "sfo00",
    "ztp": 12828.0,
    "coeff": 100.0
  },
  {
    "name": "m18p",
    "ns": "sfo00",
    "ztp": 12360.0,
    "coeff": 100.0
  },
  {
    "name": "m19p",
    "ns": "sfo00",
    "ztp": 12200.0,
    "coeff": 100.0
  },
  {
    "name": "m1p9",
    "ns": "sfo00",
    "ztp": 13968.4,
    "coeff": 100.0
  },
  {
    "name": "m21p",
    "ns": "sfo00",
    "ztp": 12052.173913043478,
    "coeff": 100.0
  },
  {
    "name": "m3p3",
    "ns": "sfo00",
    "ztp": 13828.0,
    "coeff": 100.0
  },
  {
    "name": "m3p4",
    "ns": "sfo00",
    "ztp": 13817.2,
    "coeff": 100.0
  },
  {
    "name": "m3p6",
    "ns": "sfo00",
    "ztp": 13800.0,
    "coeff": 100.0
  },
  {
    "name": "m6p3",
    "ns": "sfo00",
    "ztp": 13530.0,
    "coeff": 100.0
  },
  {
    "name": "m6p5",
    "ns": "sfo00",
    "ztp": 13504.0,
    "coeff": 100.0
  },
  {
    "name": "m6p6",
    "ns": "sfo00",
    "ztp": 13493.2,
    "coeff": 100.0
  },
  {
    "name": "m8p1",
    "ns": "sfo00",
    "ztp": 13350.0,
    "coeff": 100.0
  },
  {
    "name": "m8p8",
    "ns": "sfo00",
    "ztp": 13273.0,
    "coeff": 100.0
  },
  {
    "name": "p2p4",
    "ns": "sfo00",
    "ztp": 14400.0,
    "coeff": 100.0
  },
  {
    "name": "p2p5",
    "ns": "sfo00",
    "ztp": 14415.0,
    "coeff": 100.0
  },
  {
    "name": "p2p6",
    "ns": "sfo00",
    "ztp": 14420.0,
    "coeff": 100.0
  },
  {
    "name": "p3p6",
    "ns": "sfo00",
    "ztp": 14520.0,
    "coeff": 100.0
  },
  {
    "name": "p4p4",
    "ns": "sfo00",
    "ztp": 14600.0,
    "coeff": 100.0
  },
  {
    "name": "p4p9",
    "ns": "sfo00",
    "ztp": 14650.0,
    "coeff": 100.0
  },
  {
    "name": "p5p2",
    "ns": "sfo00",
    "ztp": 14688.0,
    "coeff": 100.0
  },
  {
    "name": "p5p4",
    "ns": "sfo00",
    "ztp": 14704.0,
    "coeff": 100.0
  },
  {
    "name": "p6p1",
    "ns": "sfo00",
    "ztp": 14772.0,
    "coeff": 100.0
  },
  {
    "name": "p6p4",
    "ns": "sfo00",
    "ztp": 14801.0,
    "coeff": 100.0
  },
  {
    "name": "p6p6",
    "ns": "sfo00",
    "ztp": 14825.0,
    "coeff": 100.0
  },
  {
    "name": "p7p2",
    "ns": "sfo00",
    "ztp": 14880.0,
    "coeff": 100.0
  },
  {
    "name": "p8p1",
    "ns": "sfo00",
    "ztp": 14970.0,
    "coeff": 100.0
  },
  {
    "name": "p9p0",
    "ns": "sfo00",
    "ztp": 15061.0,
    "coeff": 100.0
  },
  {
    "name": "the-annihilation-that-is-of-gog840ddiv23",
    "ns": "sfo00",
    "ztp": 22440.0,
    "coeff": 23.0
  },
  {
    "name": "ca-time-of-the-enoch-type-rapture7d",
    "ns": "sfo01",
    "ztp": 19173.11,
    "coeff": 7.0
  },
  {
    "name": "doctoral-one-dimensional-slice",
    "ns": "sfo01",
    "ztp": 14050.0,
    "coeff": 27.77777777777778
  },
  {
    "name": "doctoral-quality-fully-developed",
    "ns": "sfo01",
    "ztp": 14540.0,
    "coeff": 27.77777777777778
  },
  {
    "name": "post-doctoral-quality-research-seven-d",
    "ns": "sfo01",
    "ztp": 16622.3,
    "coeff": 7.0
  },
  {
    "name": "sixty-nine-week-paramour-discovery-and-timelock7d",
    "ns": "sfo01",
    "ztp": 18061.17391304348,
    "coeff": 7.0
  },
  {
    "name": "sixty-nine-week-paramour-discovery-entry-boundary7d",
    "ns": "sfo01",
    "ztp": 17753.0,
    "coeff": 7.0
  },
  {
    "name": "sixty-nine-week-paramour-discovery-optimum1-boundary7d",
    "ns": "sfo01",
    "ztp": 17792.0,
    "coeff": 7.0
  },
  {
    "name": "sixty-nine-week-paramour-discovery-optimum2-boundary7d",
    "ns": "sfo01",
    "ztp": 17799.0,
    "coeff": 7.0
  },
  {
    "name": "sixty-nine-week-timelock-entry7d",
    "ns": "sfo01",
    "ztp": 18140.0,
    "coeff": 7.0
  },
  {
    "name": "sixty-nine-week-timelock-exit-one7d",
    "ns": "sfo01",
    "ztp": 18290.0,
    "coeff": 7.0
  },
  {
    "name": "sixty-nine-week-timelock-exit-zero7d",
    "ns": "sfo01",
    "ztp": 18260.0,
    "coeff": 7.0
  },
  {
    "name": "ten-days-tribulation-eigen-diagonalized-for-seventy-weeks-system-proper-values2961ddiv23",
    "ns": "sfo01",
    "ztp": 15851.8,
    "coeff": 128.7391304347826
  },
  {
    "name": "the-intelligent-defence-body-and-the-five-terawatt-project-ie-the-elusive-sixty-nine-week-singularity-manifestation-after-the-fact-of-a-metonic-cycle7d",
    "ns": "sfo01",
    "ztp": 18509.804347826088,
    "coeff": 7.0
  },
  {
    "name": "the-shulammite-singularity-manifestation-of-the-mystery-the-immanence-in-nigeria-count-is-in-reverse7d",
    "ns": "sfo01",
    "ztp": 19480.0,
    "coeff": -7.0
  },
  {
    "name": "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-cfhthruhembossztpdesignpoint0",
    "ns": "sfo01",
    "ztp": 18772.8,
    "coeff": 7.0
  },
  {
    "name": "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-cfhthruhembossztpexit",
    "ns": "sfo01",
    "ztp": 18892.8,
    "coeff": 7.0
  },
  {
    "name": "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-forty-days-prior-cfhthruhembossztpentry",
    "ns": "sfo01",
    "ztp": 18732.8,
    "coeff": 7.0
  },
  {
    "name": "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-twenty-days-after-and-for-a-total-180day-ztp-interval-cfhthruhembossztpposteriorexit",
    "ns": "sfo01",
    "ztp": 18912.8,
    "coeff": 7.0
  },
  {
    "name": "cross-trained-to-otmotn-ztp1-at-tnldy9864-enter100d",
    "ns": "sfo02",
    "ztp": 9864.0,
    "coeff": 100.0
  },
  {
    "name": "cross-trained-to-otmotn-ztp2-at-tnldy9894-leave100d",
    "ns": "sfo02",
    "ztp": 9894.0,
    "coeff": 100.0
  },
  {
    "name": "observe-i-am-getting-married-to-the-new-nigeria25ddiv9",
    "ns": "sfo02",
    "ztp": 18410.0,
    "coeff": 9.0
  },
  {
    "name": "overcoming-the-managers-of-the-night-ztp1-at-tnldy9904-optimum700ddiv6pt9",
    "ns": "sfo02",
    "ztp": 9904.0,
    "coeff": 6.9
  },
  {
    "name": "overcoming-the-managers-of-the-night-ztp2-at-tnldy9934-optimum700ddiv6pt9",
    "ns": "sfo02",
    "ztp": 9934.0,
    "coeff": 6.9
  },
  {
    "name": "project-hybridization-development-parametric-nkechichiomaosoka40yj-taop1-internals1000ddiv7",
    "ns": "sfo02",
    "ztp": 14623.602484472052,
    "coeff": 7.0
  },
  {
    "name": "project-hybridization-development-parametric-nkechichiomaosoka40yj-taop2-internals1000ddiv7",
    "ns": "sfo02",
    "ztp": 14631.428571428572,
    "coeff": 7.0
  },
  {
    "name": "project-hybridization-development-parametric28yg-jennifer700ddiv6pt9",
    "ns": "sfo02",
    "ztp": 14040.0,
    "coeff": 6.9
  },
  {
    "name": "project-hybridization-development-parametric40yg-maryann1000ddiv6pt9",
    "ns": "sfo02",
    "ztp": 14458.695652173914,
    "coeff": 6.9
  },
  {
    "name": "project-hybridization-development-parametric40yg-obianuju1000ddiv6pt9",
    "ns": "sfo02",
    "ztp": 14668.695652173914,
    "coeff": 6.9
  },
  {
    "name": "project-integral-system-parametric-pisp36d",
    "ns": "sfo02",
    "ztp": 18158.22,
    "coeff": 36.0
  },
  {
    "name": "revott-fully-developed-secondary-stage-follicle-cross-trained-totmotn100d",
    "ns": "sfo02",
    "ztp": 9840.0,
    "coeff": 100.0
  },
  {
    "name": "revott-onset-of-antral-phase-tertiary-stage-follicle-cross-trained-totmotn100d",
    "ns": "sfo02",
    "ztp": 10200.0,
    "coeff": 100.0
  },
  {
    "name": "ephesians221-building-yg",
    "ns": "sfo03",
    "ztp": 15921.191304347823,
    "coeff": 48.3
  },
  {
    "name": "sun-and-moon-clothed-woman-built-up-in-travail100d",
    "ns": "sfo03",
    "ztp": 15999.0,
    "coeff": 100.0
  },
  {
    "name": "sun-and-moon-clothed-woman-travail-buildup1000-sevenday-depiction-not-in-standard-form",
    "ns": "sfo03",
    "ztp": 17269.0,
    "coeff": 1000.0
  },
  {
    "name": "roundabout-aimee-magnified-proper2731ddiv18",
    "ns": "sfo04",
    "ztp": 16348.0,
    "coeff": 18.0
  },
  {
    "name": "roundabout-aimee-proper",
    "ns": "sfo04",
    "ztp": 16348.0,
    "coeff": 18.0
  },
  {
    "name": "countdown-in-days-to-the-end-at-ztp-of-the-russian-government-of-the-overt-seventh-king-1d",
    "ns": "sfo05",
    "ztp": 20532.0,
    "coeff": 1.0
  },
  {
    "name": "countdown0-in-days-to-the-end-at-ztp-of-the-usa-government-of-babylon-the-great-1d",
    "ns": "sfo05",
    "ztp": 24884.7,
    "coeff": 1.0
  },
  {
    "name": "countdown1-in-days-to-the-end-at-ztp-of-the-usa-government-of-babylon-the-great-1d",
    "ns": "sfo05",
    "ztp": 25120.0,
    "coeff": 1.0
  },
  {
    "name": "countdown2-in-days-to-the-end-at-ztp-of-the-usa-government-of-babylon-the-great-1d",
    "ns": "sfo05",
    "ztp": 25141.0,
    "coeff": 1.0
  },
  {
    "name": "countdown3-in-days-to-the-end-at-ztp-of-the-usa-government-of-babylon-the-great-1d",
    "ns": "sfo05",
    "ztp": 25181.0,
    "coeff": 1.0
  },
  {
    "name": "the-first-jeroboam-yg",
    "ns": "sfo05",
    "ztp": 8259.0,
    "coeff": 48.3
  },
  {
    "name": "the-first-jeroboam100d",
    "ns": "sfo05",
    "ztp": 8259.0,
    "coeff": 100.0
  },
  {
    "name": "the-light-shines-in-the-darkness-but-the-darkness-comprehends-it-not10yg",
    "ns": "sfo05",
    "ztp": -180392.17391304355,
    "coeff": 48.3
  },
  {
    "name": "the-mystery-of-iniquity-they-shall-mingle-themselves-with-the-seed-of-men-earliest-dnps-overlap-infiltration-100d",
    "ns": "sfo05",
    "ztp": 12000.0,
    "coeff": 100.0
  },
  {
    "name": "the-mystery-of-iniquity-they-shall-mingle-themselves-with-the-seed-of-men-latest-100d",
    "ns": "sfo05",
    "ztp": 16604.7,
    "coeff": 100.0
  },
  {
    "name": "the-second-jeroboam-yg",
    "ns": "sfo05",
    "ztp": 14540.0,
    "coeff": 48.3
  },
  {
    "name": "the-second-jeroboam100d",
    "ns": "sfo05",
    "ztp": 14540.0,
    "coeff": 100.0
  },
  {
    "name": "begin-ca-cross-trained-engineer-she-that-is-of-me-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-sunclothed-woman-sixth-curtain-doubled-up-at-the-end-of-the-fifth-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7",
    "ns": "sfo06",
    "ztp": 12440.42857142857,
    "coeff": 7.0
  },
  {
    "name": "begin-ca-dnps-cleansing-fulfillment-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-at-uttermost-end-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14628.819875776397,
    "coeff": 7.0
  },
  {
    "name": "begin-ca-dnps-similitude-save-ueo-at-all-cost-from-the-ten-horns-etc-armageddon-death-march-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-at-forefront-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14263.60248447205,
    "coeff": 7.0
  },
  {
    "name": "begin-ca-nonye-igboanusi-nwokedi-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-heloise-d-argenteuil-du-paraclet-sixth-curtain-doubled-up-at-the-beginning-of-the-seventh-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7",
    "ns": "sfo06",
    "ztp": 12771.42857142857,
    "coeff": 7.0
  },
  {
    "name": "begin-inordinate-first-love-deliverance-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-hsotp-entry-to-the-eleven-curtains-of-the-temple1000ddiv7",
    "ns": "sfo06",
    "ztp": 8811.42857142857,
    "coeff": 7.0
  },
  {
    "name": "begin-it-is-done-acc-document-reception-part1-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-in-the-midst-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14404.228571428572,
    "coeff": 7.0
  },
  {
    "name": "begin-it-is-done-acc-document-reception-part2-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-in-the-midst-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14424.228571428572,
    "coeff": 7.0
  },
  {
    "name": "begin-traditional-marriage-sdq-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-entry-to-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv7",
    "ns": "sfo06",
    "ztp": 10611.42857142857,
    "coeff": 7.0
  },
  {
    "name": "end-ca-cross-trained-engineer-she-that-is-of-me-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-sunclothed-woman-sixth-curtain-doubled-up-at-the-end-of-the-fifth-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 12477.695652173914,
    "coeff": 6.9
  },
  {
    "name": "end-ca-dnps-cleansing-fulfillment-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-at-uttermost-end-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14666.08695652174,
    "coeff": 6.9
  },
  {
    "name": "end-ca-dnps-similitude-save-ueo-at-all-cost-from-the-ten-horns-etc-armageddon-death-march-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-at-forefront-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14300.869565217392,
    "coeff": 6.9
  },
  {
    "name": "end-ca-nonye-igboanusi-nwokedi-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-heloise-d-argenteuil-du-paraclet-sixth-curtain-doubled-up-at-the-beginning-of-the-seventh-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 12808.695652173914,
    "coeff": 6.9
  },
  {
    "name": "end-inordinate-first-love-deliverance-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-hsotp-entry-to-the-eleven-curtains-of-the-temple1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 8848.695652173914,
    "coeff": 6.9
  },
  {
    "name": "end-it-is-done-acc-document-reception-part1-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-in-the-midst-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14441.495652173913,
    "coeff": 6.9
  },
  {
    "name": "end-it-is-done-acc-document-reception-part2-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-in-the-midst-of-the-eleventh-curtain-of-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14461.495652173913,
    "coeff": 6.9
  },
  {
    "name": "end-traditional-marriage-sdq-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-entry-to-the-eleven-curtains-of-the-exodus26v7to9temple-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 10648.695652173914,
    "coeff": 6.9
  },
  {
    "name": "recuperation-and-shulamite-vindication-against-the-backdrop-of-the-gestation-of-the-dystopia-of-the-seventh-king-and-wwiii100ddiv7",
    "ns": "sfo06",
    "ztp": 19337.14285714286,
    "coeff": 7.0
  },
  {
    "name": "revelation-of-the-trial-revott-eigen-proper-equation-200d",
    "ns": "sfo06",
    "ztp": 14160.0,
    "coeff": 200.0
  },
  {
    "name": "sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite-exodus26v7to9-eleven-curtains-foremost-entry1000ddiv7",
    "ns": "sfo06",
    "ztp": 10611.42857142857,
    "coeff": 7.0
  },
  {
    "name": "sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite-exodus26v7to9-eleven-curtains-uttermost-exit1000ddiv7",
    "ns": "sfo06",
    "ztp": 14631.42857142857,
    "coeff": 7.0
  },
  {
    "name": "sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite-exodus26v7to9-one-hour-of-the-ten-horns-at-forefront-of-the-eleventh-curtain1000ddiv7",
    "ns": "sfo06",
    "ztp": 14263.602484472049,
    "coeff": 7.0
  },
  {
    "name": "sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite-exodus26v7to9-sunclothed-woman-between-fifth-and-sixth-curtains1000ddiv7",
    "ns": "sfo06",
    "ztp": 12437.51552795031,
    "coeff": 7.0
  },
  {
    "name": "sdq-phdp-taop-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-deliverance-from-clutches-of-inordinate-love-ergo-torment-scarring-and-trauma-hsotp-entry1000ddiv7",
    "ns": "sfo06",
    "ztp": 8811.42857142857,
    "coeff": 7.0
  },
  {
    "name": "sdq-philippians212b13-fulfilled-in-sos-ie-work-out-your-own-salvation-becomes-the-shulamite1000ddiv7",
    "ns": "sfo06",
    "ztp": 10611.42857142857,
    "coeff": 7.0
  },
  {
    "name": "shulam-she-that-is-of-me-the-new-nation-determined-and-globally-resonant-emancipation-signal-in-the-time-lockdown-boundary-of-enoch-between-is-and-is-to-come100d",
    "ns": "sfo06",
    "ztp": 11280.0,
    "coeff": 100.0
  },
  {
    "name": "shulam-the-queen-yj",
    "ns": "sfo06",
    "ztp": 8040.0,
    "coeff": 360.0
  },
  {
    "name": "shulam-the-queen100d",
    "ns": "sfo06",
    "ztp": 8040.0,
    "coeff": 100.0
  },
  {
    "name": "countdown-from-the-twenty-fourth-yj-unto-the-vision360d",
    "ns": "sfo07",
    "ztp": 25931.8,
    "coeff": 360.0
  },
  {
    "name": "countdown100d-as-per-ztp-to-armageddon",
    "ns": "sfo07",
    "ztp": 26421.0,
    "coeff": 100.0
  },
  {
    "name": "countdown100d-as-per-ztp-to-the-global-timeshortening-line",
    "ns": "sfo07",
    "ztp": 25032.8,
    "coeff": 100.0
  },
  {
    "name": "countdown100d-as-per-ztp-to-the-last-earth-reaping-before-the-great-tribulation",
    "ns": "sfo07",
    "ztp": 24929.7,
    "coeff": 100.0
  },
  {
    "name": "countdown100d-as-per-ztp-to-the-sealing-of-the-elect-of-the-twelve-tribes-of-israel",
    "ns": "sfo07",
    "ztp": 23771.8,
    "coeff": 100.0
  },
  {
    "name": "countdown100d-as-per-ztp-to-the-travail-of-the-sun-and-moon-clothed-woman",
    "ns": "sfo07",
    "ztp": 24269.0,
    "coeff": 100.0
  },
  {
    "name": "countdown100d-as-per-ztp-to-the-vision",
    "ns": "sfo07",
    "ztp": 25931.8,
    "coeff": 100.0
  },
  {
    "name": "countdown100d-as-per-ztp-to-the-wrath",
    "ns": "sfo07",
    "ztp": 26232.8,
    "coeff": 100.0
  },
  {
    "name": "again-born-ie-born-of-the-spirit-circumspection-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 30972.0,
    "coeff": 100.0
  },
  {
    "name": "again-born-ie-born-of-the-spirit-is-the-end-ie-purpose-of-all-things-circumspection100d",
    "ns": "sfo08",
    "ztp": 22692.0,
    "coeff": 100.0
  },
  {
    "name": "and-after-the-league-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 21773.2,
    "coeff": 100.0
  },
  {
    "name": "and-after-the-league-made-with-him-he-shall-work-deceitfully100d",
    "ns": "sfo08",
    "ztp": 13493.2,
    "coeff": 100.0
  },
  {
    "name": "and-become-strong-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 22248.4,
    "coeff": 100.0
  },
  {
    "name": "and-become-strong-with-a-small-people100d",
    "ns": "sfo08",
    "ztp": 13968.4,
    "coeff": 100.0
  },
  {
    "name": "and-his-army-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23052.0,
    "coeff": 100.0
  },
  {
    "name": "and-his-army-shall-overflow100d",
    "ns": "sfo08",
    "ztp": 14772.0,
    "coeff": 100.0
  },
  {
    "name": "and-his-heart-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23250.0,
    "coeff": 100.0
  },
  {
    "name": "and-his-heart-shall-be-against-the-holy-covenant-and-he-shall-do-exploits100d",
    "ns": "sfo08",
    "ztp": 14970.0,
    "coeff": 100.0
  },
  {
    "name": "and-many-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23106.0,
    "coeff": 100.0
  },
  {
    "name": "and-many-shall-fall-down-slain100d",
    "ns": "sfo08",
    "ztp": 14826.0,
    "coeff": 100.0
  },
  {
    "name": "and-shall-forecast-his-devices-against-the-strongholds-even-for-a-time-finish100d",
    "ns": "sfo08",
    "ztp": 14600.0,
    "coeff": 100.0
  },
  {
    "name": "and-shall-forecast-his-devices-against-the-strongholds-even-for-a-time-start100d",
    "ns": "sfo08",
    "ztp": 14240.0,
    "coeff": 100.0
  },
  {
    "name": "and-shall-forecast1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 22520.0,
    "coeff": 100.0
  },
  {
    "name": "and-shall-forecast2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 22880.0,
    "coeff": 100.0
  },
  {
    "name": "and-shall-take-away-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23718.0,
    "coeff": 100.0
  },
  {
    "name": "and-shall-take-away-the-daily-sacrifice100d",
    "ns": "sfo08",
    "ztp": 15438.0,
    "coeff": 100.0
  },
  {
    "name": "and-they-shall-place-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23730.0,
    "coeff": 100.0
  },
  {
    "name": "and-they-shall-place-the-abomination-that-makes-desolate100d",
    "ns": "sfo08",
    "ztp": 15450.0,
    "coeff": 100.0
  },
  {
    "name": "and-they-shall-pollute-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23700.0,
    "coeff": 100.0
  },
  {
    "name": "and-they-shall-pollute-the-sanctuary-of-strength100d",
    "ns": "sfo08",
    "ztp": 15420.0,
    "coeff": 100.0
  },
  {
    "name": "but-tidings-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 25590.0,
    "coeff": 100.0
  },
  {
    "name": "but-tidings-out-of-the-east-and-out-of-the-north-shall-trouble-him100d",
    "ns": "sfo08",
    "ztp": 17310.0,
    "coeff": 100.0
  },
  {
    "name": "ca-peak-m1710-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 20730.0,
    "coeff": 100.0
  },
  {
    "name": "ca-peak-m1710-of-the-raiser-of-taxes-in-the-glory-of-the-kingdom100d",
    "ns": "sfo08",
    "ztp": 12450.0,
    "coeff": 100.0
  },
  {
    "name": "for-he-shall-come-up-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 22108.0,
    "coeff": 100.0
  },
  {
    "name": "for-he-shall-come-up100d",
    "ns": "sfo08",
    "ztp": 13828.0,
    "coeff": 100.0
  },
  {
    "name": "he-shall-confirm-the-covenant-with-many-for-one-week-finish100d",
    "ns": "sfo08",
    "ztp": 17871.224596273292,
    "coeff": 100.0
  },
  {
    "name": "he-shall-confirm-the-covenant-with-many-for-one-week-finish100d",
    "ns": "sfo08",
    "ztp": 17871.224596273292,
    "coeff": 100.0
  },
  {
    "name": "he-shall-confirm-the-covenant-with-many-for-one-week-midst100d",
    "ns": "sfo08",
    "ztp": 16592.963726708076,
    "coeff": 100.0
  },
  {
    "name": "he-shall-confirm2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 24872.963726708076,
    "coeff": 100.0
  },
  {
    "name": "he-shall-confirm3-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 26151.224596273292,
    "coeff": 100.0
  },
  {
    "name": "he-shall-plant-the-tabernacles-of-his-palace-between-the-seas-in-the-glorious-holy-mountain-finish100d",
    "ns": "sfo08",
    "ztp": 17428.0,
    "coeff": 100.0
  },
  {
    "name": "he-shall-plant-the-tabernacles-of-his-palace-between-the-seas-in-the-glorious-holy-mountain-start100d",
    "ns": "sfo08",
    "ztp": 17373.0,
    "coeff": 100.0
  },
  {
    "name": "he-shall-plant1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 25653.0,
    "coeff": 100.0
  },
  {
    "name": "he-shall-plant2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 25708.0,
    "coeff": 100.0
  },
  {
    "name": "he-shall-return-and-have-intelligence-with-them-that-forsake-the-holy-covenant100d",
    "ns": "sfo08",
    "ztp": 15116.87,
    "coeff": 100.0
  },
  {
    "name": "in-his-estate-there-shall-rise-a-vile-person-to-whom-they-shall-not-give-the-honour-of-the-kingdom100d",
    "ns": "sfo08",
    "ztp": 12560.0,
    "coeff": 100.0
  },
  {
    "name": "revelation-of-the-trial-revott-at-the-end-ie-purpose-of-all-things-is-at-hand-ie-at-birth100d",
    "ns": "sfo08",
    "ztp": 22440.0,
    "coeff": 100.0
  },
  {
    "name": "revott-purpose-of-all-things-is-at-hand-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 30720.0,
    "coeff": 100.0
  },
  {
    "name": "the-court-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 24881.0,
    "coeff": 100.0
  },
  {
    "name": "the-court-that-is-without-begin100d",
    "ns": "sfo08",
    "ztp": 16601.0,
    "coeff": 100.0
  },
  {
    "name": "the-court2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 25181.0,
    "coeff": 100.0
  },
  {
    "name": "the-end-ie-purpose-of-all-things1-is-at-hand-yg",
    "ns": "sfo08",
    "ztp": 22440.0,
    "coeff": 48.3
  },
  {
    "name": "the-ships-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23341.0,
    "coeff": 100.0
  },
  {
    "name": "the-ships-of-chittim-shall-come-against-him100d",
    "ns": "sfo08",
    "ztp": 15061.0,
    "coeff": 100.0
  },
  {
    "name": "the-ten-horns-completely-burn-the-flesh-of-mystery-babylon-with-fire-the-court-that-is-without-end100d",
    "ns": "sfo08",
    "ztp": 16901.0,
    "coeff": 100.0
  },
  {
    "name": "what-withholdeth-bw-ca-18pt50-and-25pt20-the-mystery-of-iniquity-and-that-number-is-embedded-in-this-sfo36d",
    "ns": "sfo08",
    "ztp": 19866.0,
    "coeff": 36.0
  },
  {
    "name": "within-few-days-m1600-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 20840.0,
    "coeff": 100.0
  },
  {
    "name": "within-few-days-m1600-raiser-of-taxes-is-destroyed-not-in-battle-nor-in-anger100d",
    "ns": "sfo08",
    "ztp": 12560.0,
    "coeff": 100.0
  },
  {
    "name": "within-few-days-m1640-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 20800.0,
    "coeff": 100.0
  },
  {
    "name": "within-few-days-m1640-raiser-of-taxes-is-destroyed-not-in-battle-nor-in-anger100d",
    "ns": "sfo08",
    "ztp": 12520.0,
    "coeff": 100.0
  },
  {
    "name": "within-few-days-m1656-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 20784.0,
    "coeff": 100.0
  },
  {
    "name": "within-few-days-m1656-raiser-of-taxes-is-destroyed-not-in-battle-nor-in-anger100d",
    "ns": "sfo08",
    "ztp": 12504.0,
    "coeff": 100.0
  },
  {
    "name": "yea-and-the-prince-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 21551.0,
    "coeff": 100.0
  },
  {
    "name": "yea-and-the-prince-of-the-covenant-also100d",
    "ns": "sfo08",
    "ztp": 13271.0,
    "coeff": 100.0
  },
  {
    "name": "seeking-finding-the-comfort-in-charity-faith-and-hope300d",
    "ns": "sfo09",
    "ztp": 18290.0,
    "coeff": 300.0
  },
  {
    "name": "after-gogs-deadly-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24884.7,
    "coeff": 100.0
  },
  {
    "name": "after-gogs-deadly-wound-is-healed-he-is-completely-empowered-and-the-ten-horns-hate-mystery-babylon100d",
    "ns": "sfo10",
    "ztp": 16604.7,
    "coeff": 100.0
  },
  {
    "name": "again-exclamated-the-great-school700ddiv6pt9",
    "ns": "sfo10",
    "ztp": 5798.260869565217,
    "coeff": 6.9
  },
  {
    "name": "babylon-is-fallen-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24869.68695652173,
    "coeff": 100.0
  },
  {
    "name": "babylon-is-fallen-is-fallen-start-of-2300days-unto-the-cleansing-of-the-sanctuary100d",
    "ns": "sfo10",
    "ztp": 16589.68695652173,
    "coeff": 100.0
  },
  {
    "name": "counting-in-weeks-unto-the-physical-revelation-of-my-wife-the-wife-the-chosen7d",
    "ns": "sfo10",
    "ztp": 16931.8,
    "coeff": 7.0
  },
  {
    "name": "ephesians613-fulfillment-withstand-in-the-evil-day-and-having-done-all-to-stand-means-the-lords-money-in-context-of-the-shula-manifests-even-thru-the-mammon-line-begin-cultivation100d",
    "ns": "sfo10",
    "ztp": 10800.0,
    "coeff": 100.0
  },
  {
    "name": "ephesians613-fulfillment-withstand-in-the-evil-day-and-having-done-all-to-stand-means-the-lords-money-in-context-of-the-shula-manifests-even-thru-the-mammon-line-begin-harvest100d",
    "ns": "sfo10",
    "ztp": 10920.0,
    "coeff": 100.0
  },
  {
    "name": "ephesians613-fulfillment-withstand-in-the-evil-day-and-having-done-all-to-stand-means-the-lords-money-in-context-of-the-shula-manifests-even-thru-the-mammon-line-end-harvest100d",
    "ns": "sfo10",
    "ztp": 10980.0,
    "coeff": 100.0
  },
  {
    "name": "false-prophet-another-beast-coming-up-out-of-the-earth-100d",
    "ns": "sfo10",
    "ztp": 16160.0,
    "coeff": 100.0
  },
  {
    "name": "false-prophet-causeth-all-to-receive-a-mark-in-their-right-hand-or-in-their-foreheads-100d",
    "ns": "sfo10",
    "ztp": 16664.0,
    "coeff": 100.0
  },
  {
    "name": "false-prophet-had-power-to-give-life-unto-the-image-of-the-beast-100d",
    "ns": "sfo10",
    "ztp": 16654.0,
    "coeff": 100.0
  },
  {
    "name": "false-prophet-that-they-should-make-an-image-to-the-beast-100d",
    "ns": "sfo10",
    "ztp": 16605.0,
    "coeff": 100.0
  },
  {
    "name": "false-prophet0-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24440.0,
    "coeff": 100.0
  },
  {
    "name": "false-prophet1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24885.0,
    "coeff": 100.0
  },
  {
    "name": "false-prophet2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24934.0,
    "coeff": 100.0
  },
  {
    "name": "false-prophet3-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24944.0,
    "coeff": 100.0
  },
  {
    "name": "gog-ascending-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24811.0,
    "coeff": 100.0
  },
  {
    "name": "gog-ascending-to-power-on-the-dragons-throne-as-a-cloud-to-cover-the-land100d",
    "ns": "sfo10",
    "ztp": 16531.0,
    "coeff": 100.0
  },
  {
    "name": "miracle-normal-life-sevenhunddiv6pt9",
    "ns": "sfo10",
    "ztp": 8413.0,
    "coeff": 6.9
  },
  {
    "name": "mystery-babylon-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24762.0,
    "coeff": 100.0
  },
  {
    "name": "mystery-babylon-is-revealed-to-be-the-vampire-system-that-propagates-itself-by-drinking-the-saints-blood-while-gog-becomes-the-lycan-of-the-abyss-ie-an-end-of-pure-destruction-heading-to-perdition-which-she-sits-on-ie-controls-a-lethal-unsustainable-mix-ergo-the-10horns100d",
    "ns": "sfo10",
    "ztp": 16482.0,
    "coeff": 100.0
  },
  {
    "name": "one-of-gogs-heads-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo10",
    "ztp": 24881.2,
    "coeff": 100.0
  },
  {
    "name": "one-of-gogs-heads-is-wounded-unto-death100d",
    "ns": "sfo10",
    "ztp": 16601.2,
    "coeff": 100.0
  },
  {
    "name": "promotion-not-from-east-nor-from-west23ddiv82pt80",
    "ns": "sfo10",
    "ztp": 17089.609752415457,
    "coeff": 8280.0
  },
  {
    "name": "the-passion-of-the-gift-from-god100d",
    "ns": "sfo10",
    "ztp": 18388.0,
    "coeff": 100.0
  },
  {
    "name": "tnl-1000d",
    "ns": "sfo10",
    "ztp": 0.0,
    "coeff": 1000.0
  },
  {
    "name": "tnl-yg",
    "ns": "sfo10",
    "ztp": 0.0,
    "coeff": 48.3
  },
  {
    "name": "tnl-yj",
    "ns": "sfo10",
    "ztp": 0.0,
    "coeff": 360.0
  },
  {
    "name": "walking-leaping-praising-god-all-the-way-to-armageddon100d-ztp18040-justified-in-the-midst-of-the-adversarial-gatherings",
    "ns": "sfo10",
    "ztp": 18040.0,
    "coeff": 100.0
  },
  {
    "name": "walking-leaping-praising-god-all-the-way-to-armageddon100d-ztp18117pt-beginnings-of-the-gathering-of-the-mighty-and-holy-people",
    "ns": "sfo10",
    "ztp": 18117.282608695536,
    "coeff": 100.0
  },
  {
    "name": "walking-leaping-praising-god-all-the-way-to-armageddon100d-ztp18120",
    "ns": "sfo10",
    "ztp": 18120.0,
    "coeff": 100.0
  },
  {
    "name": "walking-leaping-praising-god-all-the-way-to-armageddon100d-ztp18148-glorious-end-as-in-purpose-of-the-light-of-seven-days",
    "ns": "sfo10",
    "ztp": 18148.0,
    "coeff": 100.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealenter-yg",
    "ns": "sfo11",
    "ztp": 18731.8,
    "coeff": 365.21739130434787
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealenter100d",
    "ns": "sfo11",
    "ztp": 18731.8,
    "coeff": 100.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealenter360d",
    "ns": "sfo11",
    "ztp": 18731.8,
    "coeff": 360.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealleave-yg",
    "ns": "sfo11",
    "ztp": 19091.8,
    "coeff": 365.21739130434787
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealleave100d",
    "ns": "sfo11",
    "ztp": 19091.8,
    "coeff": 100.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-sealleave360d",
    "ns": "sfo11",
    "ztp": 19091.8,
    "coeff": 360.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-setting0-100d",
    "ns": "sfo11",
    "ztp": 18794.8,
    "coeff": 100.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-trumpet-yg",
    "ns": "sfo11",
    "ztp": 18912.8,
    "coeff": 365.21739130434787
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-trumpet100d",
    "ns": "sfo11",
    "ztp": 18912.8,
    "coeff": 100.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-trumpet360d",
    "ns": "sfo11",
    "ztp": 18912.8,
    "coeff": 360.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-yg",
    "ns": "sfo11",
    "ztp": 18793.8,
    "coeff": 365.21739130434787
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss360d",
    "ns": "sfo11",
    "ztp": 18793.8,
    "coeff": 360.0
  },
  {
    "name": "a-simple-count-of-years-of-the-creature-born-of-the-dnps-tacc-unto-he-begins-to-be-thirty-as-was-supposed-yg",
    "ns": "sfo12",
    "ztp": 18626.08695652174,
    "coeff": 2.3
  },
  {
    "name": "judgment1-shall-begin-at-the-house-of-god-100d",
    "ns": "sfo12",
    "ztp": 19200.0,
    "coeff": 1.0
  },
  {
    "name": "judgment2-shall-begin-at-the-house-of-god-100d",
    "ns": "sfo12",
    "ztp": 19260.0,
    "coeff": 1.0
  },
  {
    "name": "surprised-by-love-formerly-understood-by-paramour-discovery-2800ddiv23",
    "ns": "sfo12",
    "ztp": 15851.8,
    "coeff": 23.0
  },
  {
    "name": "ten-days-tribulation-unto-armageddon-ca-gathering-starts-2800ddiv23",
    "ns": "sfo12",
    "ztp": 16282.6,
    "coeff": 23.0
  },
  {
    "name": "ten-days-tribulation-unto-armageddon-finished-2800ddiv23",
    "ns": "sfo12",
    "ztp": 16348.0,
    "coeff": 23.0
  },
  {
    "name": "the-creature-learns-to-be-separate-between-good-and-evil-yg",
    "ns": "sfo12",
    "ztp": 1800.0,
    "coeff": 365.21739130434787
  },
  {
    "name": "the-creature-learns-to-be-separate-between-good-and-evil-yj",
    "ns": "sfo12",
    "ztp": 1800.0,
    "coeff": 360.0
  },
  {
    "name": "shulam-military-time-deathmode1-igvd-yg",
    "ns": "sfo13",
    "ztp": 9125.434782608769,
    "coeff": 48.3
  },
  {
    "name": "shulam-military-time-deathmode1-igvd-yj",
    "ns": "sfo13",
    "ztp": 9125.434782608769,
    "coeff": 360.0
  },
  {
    "name": "shulam-military-time-deathmode1-igvd100",
    "ns": "sfo13",
    "ztp": 9125.434782608769,
    "coeff": 100.0
  },
  {
    "name": "shulam-military-time-deathmode2-igvd-yg",
    "ns": "sfo13",
    "ztp": 9130.434782608696,
    "coeff": 48.3
  },
  {
    "name": "unto-the-overflow-of-the-shulammite-military-yg",
    "ns": "sfo13",
    "ztp": 16800.0,
    "coeff": 48.3
  },
  {
    "name": "ztp7571-approaching-developed-primary-follicle-inner-galaxy-vision-development100d",
    "ns": "sfo13",
    "ztp": 7571.8,
    "coeff": 100.0
  },
  {
    "name": "ztp7624-approaching-developed-primary-follicle-inner-galaxy-vision-development100d",
    "ns": "sfo13",
    "ztp": 7624.0,
    "coeff": 100.0
  },
  {
    "name": "ztp7680-approaching-developed-primary-follicle-inner-galaxy-vision-development100d",
    "ns": "sfo13",
    "ztp": 7680.0,
    "coeff": 100.0
  },
  {
    "name": "ztp7932-approaching-developed-primary-follicle-inner-galaxy-vision-development100d",
    "ns": "sfo13",
    "ztp": 7932.0,
    "coeff": 100.0
  },
  {
    "name": "ztp7968-approaching-developed-primary-follicle-inner-galaxy-vision-development100d",
    "ns": "sfo13",
    "ztp": 7968.0,
    "coeff": 100.0
  },
  {
    "name": "part1-embryo-genesis-seedling-plant-photosynthesis-egspp-perspective-of-growth-of-christ-in-me-documenting-my-disconnection-from-these-streets-forever-the-count-of-which-is-effective-before-25032pt8tnldy-360d",
    "ns": "sfo14",
    "ztp": 15581.3,
    "coeff": 360.0
  },
  {
    "name": "part2-embryo-genesis-seedling-plant-photosynthesis-egspp-perspective-of-growth-of-christ-in-me-documenting-my-disconnection-from-these-streets-forever-the-count-of-which-is-effective-after-25032pt8tnldy-240d",
    "ns": "sfo14",
    "ztp": 18731.8,
    "coeff": 240.0
  },
  {
    "name": "the-egspp-creature-sets-off-into-the-world-and-finds-its-purpose100d",
    "ns": "sfo14",
    "ztp": 18731.8,
    "coeff": 100.0
  },
  {
    "name": "the-eat-rest-work-time-savings-grant100d",
    "ns": "sfo15",
    "ztp": 16478.0,
    "coeff": 100.0
  },
  {
    "name": "the144000000-time-redemption-proper-metric",
    "ns": "sfo15",
    "ztp": 16478.0,
    "coeff": 1.0
  },
  {
    "name": "the-flee-factor-yg",
    "ns": "sfo16",
    "ztp": 20640.0,
    "coeff": 17640.0
  },
  {
    "name": "the-flee-factor100d",
    "ns": "sfo16",
    "ztp": 20640.0,
    "coeff": 100.0
  },
  {
    "name": "if-the-universe-is-the-answer-what-is-the-question-is-answered-by-the-god-particle-unto-onset1-of-dispensation-one100d",
    "ns": "sfo17",
    "ztp": 12828.0,
    "coeff": 100.0
  },
  {
    "name": "if-the-universe-is-the-answer-what-is-the-question-is-answered-by-the-god-particle-unto-onset2star-of-dispensation-one100d",
    "ns": "sfo17",
    "ztp": 12839.0,
    "coeff": 100.0
  },
  {
    "name": "if-the-universe-is-the-answer-what-is-the-question-is-answered-by-the-god-particle-unto-onset3-of-dispensation-one100d",
    "ns": "sfo17",
    "ztp": 12864.0,
    "coeff": 100.0
  },
  {
    "name": "if-the-universe-is-the-answer-what-is-the-question-is-answered-by-the-god-particle-unto-onset4star-of-dispensation-one100d",
    "ns": "sfo17",
    "ztp": 12960.0,
    "coeff": 100.0
  },
  {
    "name": "if-the-universe1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo17",
    "ztp": 21108.0,
    "coeff": 100.0
  },
  {
    "name": "if-the-universe2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo17",
    "ztp": 21119.0,
    "coeff": 100.0
  },
  {
    "name": "if-the-universe3-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo17",
    "ztp": 21144.0,
    "coeff": 100.0
  },
  {
    "name": "if-the-universe4-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo17",
    "ztp": 21240.0,
    "coeff": 100.0
  },
  {
    "name": "the-great-things-of-gods-law-a-little-here-a-little-there-proper-metric",
    "ns": "sfo17",
    "ztp": 0.0,
    "coeff": 1.0
  },
  {
    "name": "christ-jesus-the-lord-the-everlasting-father-is-the-king-of-the-holy-family-cjtl-tef-itk-othf-jesus36000d",
    "ns": "sfo18",
    "ztp": -1800.0,
    "coeff": 36000.0
  },
  {
    "name": "christ-jesus-the-lord-the-everlasting-father-is-the-king-of-the-holy-family-cjtl-tef-itk-othf-paul36000d",
    "ns": "sfo18",
    "ztp": 0.0,
    "coeff": 36000.0
  },
  {
    "name": "comprehensive-chronicles-of-the-holy-scriptures-having-solomons-temple-complete-at19pt51-enter36000d",
    "ns": "sfo18",
    "ztp": -1764256.5216086959,
    "coeff": 36000.0
  },
  {
    "name": "comprehensive-chronicles-of-the-holy-scriptures-having-solomons-temple-complete-at19pt51-patriarch-view36000d",
    "ns": "sfo18",
    "ztp": -1762456.5216086959,
    "coeff": 36000.0
  },
  {
    "name": "deliverance-and-redemption-of-the-man-Adam-planted-at-ztp-in-the-garden-eastward-in-eden36000d",
    "ns": "sfo18",
    "ztp": -2136496.5217391304,
    "coeff": 36000.0
  },
  {
    "name": "proper-of-fully-developed-subset-of-the-good-samaritan-system-implementation-of-the-zero-trade-salvation",
    "ns": "sfo19",
    "ztp": 21505.08695652174,
    "coeff": 1.0
  },
  {
    "name": "the-good-samaritan-system-implementation-of-the-zero-trade-salvation-global-proper",
    "ns": "sfo19",
    "ztp": 10183.347826086956,
    "coeff": 20.7
  },
  {
    "name": "the-great-things-of-gods-law-a-little-here-a-little-there-yg-streamline-at-xequals38pt325",
    "ns": "sfo20",
    "ztp": 7934.782608695653,
    "coeff": 48.3
  },
  {
    "name": "the-great-things-of-gods-law-a-little-here-a-little-there-yg-streamline-at-xequals38pt95878",
    "ns": "sfo20",
    "ztp": 8066.0,
    "coeff": 48.3
  },
  {
    "name": "the-great-things-of-gods-law-a-little-here-a-little-there-yg-streamline-at-xequals44pt10",
    "ns": "sfo20",
    "ztp": 9130.434782608696,
    "coeff": 48.3
  },
  {
    "name": "the-great-things-of-gods-law-a-little-here-a-little-there-yj-streamline-at-xequals38pt325",
    "ns": "sfo20",
    "ztp": 7934.782608695653,
    "coeff": 360.0
  },
  {
    "name": "the-great-things-of-gods-law-a-little-here-a-little-there-yj-streamline-at-xequals38pt95878",
    "ns": "sfo20",
    "ztp": 8066.0,
    "coeff": 360.0
  },
  {
    "name": "the-great-things-of-gods-law-a-little-here-a-little-there-yj-streamline-at-xequals44pt10",
    "ns": "sfo20",
    "ztp": 9130.434782608696,
    "coeff": 360.0
  },
  {
    "name": "saved-and-locked-to-the-vision-yg",
    "ns": "sfo21",
    "ztp": 7934.782608695653,
    "coeff": 365.21739130434787
  },
  {
    "name": "saved-and50yj-lock-to-the-vision-yj",
    "ns": "sfo21",
    "ztp": 7934.782608695653,
    "coeff": 360.0
  },
  {
    "name": "saved-by-christ-jesus-100d",
    "ns": "sfo21",
    "ztp": 7934.782608695653,
    "coeff": 100.0
  },
  {
    "name": "saved1000d",
    "ns": "sfo21",
    "ztp": 7934.782608695653,
    "coeff": 1000.0
  },
  {
    "name": "the-new-creature-in-the-end-times-tnc-itet-an-hsotp-beginning-yg",
    "ns": "sfo21",
    "ztp": 14159.3,
    "coeff": 365.21739130434787
  },
  {
    "name": "the-new-creature-in-the-end-times-tnc-itet-an-hsotp-end-purpose-yg",
    "ns": "sfo21",
    "ztp": 15959.3,
    "coeff": 365.21739130434787
  },
  {
    "name": "the-new-creature-in-the-end-times-tnc-itet-an-hsotp-executable-core-enter-fourth-egg-within-yg",
    "ns": "sfo21",
    "ztp": 15571.8,
    "coeff": 365.21739130434787
  },
  {
    "name": "the-new-creature-in-the-end-times-tnc-itet-an-hsotp-executable-core-entry-point-yg",
    "ns": "sfo21",
    "ztp": 14731.8,
    "coeff": 365.21739130434787
  },
  {
    "name": "the-new-creature-in-the-end-times-tnc-itet-an-hsotp-executable-core-exit-point1-yg",
    "ns": "sfo21",
    "ztp": 15851.8,
    "coeff": 365.21739130434787
  },
  {
    "name": "the-new-creature-in-the-end-times-tnc-itet-an-hsotp-executable-core-exit-point2-yg",
    "ns": "sfo21",
    "ztp": 15931.8,
    "coeff": 365.21739130434787
  },
  {
    "name": "z-tnldy-clock3",
    "ns": "sfo22",
    "ztp": 0.0,
    "coeff": 1.0,
    "master_clock": true
  },
  {
    "name": "core-completion-matrix1-wherein-the-creature-of-the-alien-corridor-cleanses-his-way-and-knowledge-is-increased-whilst-iron-reacts-at-singular-heat-with-miry-clay240d",
    "ns": "sfo23",
    "ztp": 10800.0,
    "coeff": 240.0
  },
  {
    "name": "core-completion-matrix2-wherein-the-creature-of-the-alien-corridor-cleanses-his-way-and-knowledge-is-increased-whilst-iron-reacts-at-singular-heat-with-miry-clay240d",
    "ns": "sfo23",
    "ztp": 10853.0,
    "coeff": 240.0
  },
  {
    "name": "the-acc-abstract-of-projects-and-the-trial-ztp11640-a-minus-half-six-and-then-seventh-day-depiction-minus360d-not-in-standard-form2400d",
    "ns": "sfo23",
    "ztp": 11640.0,
    "coeff": 2400.0
  },
  {
    "name": "the-acc-abstract-of-projects-and-the-trial-ztp12000-a-minus-half-six-and-then-seventh-day-depiction-not-in-standard-form2400d",
    "ns": "sfo23",
    "ztp": 12000.0,
    "coeff": 2400.0
  },
  {
    "name": "the-acc-abstract-of-projects-and-the-trial-ztp12360-a-minus-half-six-and-then-seventh-day-depiction-plus360d-not-in-standard-form2400d",
    "ns": "sfo23",
    "ztp": 12360.0,
    "coeff": 2400.0
  },
  {
    "name": "the-numbering-of-the-5587days-of-gog-in-power-on-the-earth100d",
    "ns": "sfo23",
    "ztp": 20840.0,
    "coeff": 100.0
  },
  {
    "name": "the-trial-ztp12053-a-minus-half-six-and-then-seventh-day-depiction-entering-into-a360-day-frame2-of-a-time-times-and-half-a-time-not-in-standard-form2400d",
    "ns": "sfo23",
    "ztp": 12053.0,
    "coeff": 2400.0
  },
  {
    "name": "dnps-the-seven-and-thirteen-year-conversion12000ztp7500ddiv7",
    "ns": "sfo24",
    "ztp": 12000.0,
    "coeff": 1071.4285714285713
  },
  {
    "name": "dnps-the-seven-and-thirteen-year-conversion12060ztp7500ddiv7",
    "ns": "sfo24",
    "ztp": 12060.0,
    "coeff": 1071.4285714285713
  },
  {
    "name": "imputation-of-sin-via-the-law-given-by-moses-against-the-transgression-of-those-angels-followed-by-the-grace-and-truth-of-jesus-christ-unto-the-seventh-angel-trumpet-sound-daysi-synchronization-100yg",
    "ns": "sfo24",
    "ztp": -865540.0,
    "coeff": 48.3
  },
  {
    "name": "kristallnacht-to-begincleanseafterarmageddon-31028one-month-pattern-daysi-28000ddiv23",
    "ns": "sfo24",
    "ztp": -11317.0,
    "coeff": 0.0008214285714285715
  },
  {
    "name": "usa-dem-rev-sit-on-brit-emp-70000ddiv69",
    "ns": "sfo24",
    "ztp": -57542.0,
    "coeff": 69.0
  },
  {
    "name": "usa-sit-10yg",
    "ns": "sfo24",
    "ztp": -70611.45652,
    "coeff": 48.3
  },
  {
    "name": "from-the-expulsion-of-rev-henry-townsend-etc-first-missionary-to-abeokuta-ca1867-unto-justification-is-the-pathway-to-the-new-nation-for-those-burdened-with-this-nigeria-isaiah18-yg",
    "ns": "sfo25",
    "ztp": 16597.0,
    "coeff": 48.3
  },
  {
    "name": "from-the-expulsion-of-rev-henry-townsend-etc-first-missionary-to-abeokuta-ca1867-unto-justification-is-the-pathway-to-the-new-nation-for-those-burdened-with-this-nigeria-isaiah18-yj",
    "ns": "sfo25",
    "ztp": 16597.0,
    "coeff": 360.0
  },
  {
    "name": "she-that-travaileth-and-bringeth-forth-the-fruits-of-the-kingdom-of-god-measured-from-ca-the-international-human-rights-declaration-against-slavery-at-the-congress-of-vienna-unto-etc-patrice-lumumba-at-ztp-ca-the-preminent-month-of-the-year-of-africa-360d",
    "ns": "sfo25",
    "ztp": -3350.0,
    "coeff": 360.0
  },
  {
    "name": "she-that-travaileth-and-bringeth-forth-the-fruits-of-the-kingdom-of-god-measured-from-ca-the-international-human-rights-declaration-against-slavery-at-the-congress-of-vienna-unto-ztp-at-etc-nigeria-independence-360d",
    "ns": "sfo25",
    "ztp": -3322.45,
    "coeff": 360.0
  },
  {
    "name": "the-federal-republic-of-nigeria-shall-be-one-stick-in-the-hand-of-the-lord-yg",
    "ns": "sfo25",
    "ztp": -3323.0,
    "coeff": 48.3
  },
  {
    "name": "the-federal-republic-of-nigeria-shall-be-one-stick-in-the-hand-of-the-lord-yj",
    "ns": "sfo25",
    "ztp": -3323.0,
    "coeff": 360.0
  },
  {
    "name": "abaddon-apollyon100d",
    "ns": "sfo26",
    "ztp": 17213.8,
    "coeff": 100.0
  },
  {
    "name": "abaddon-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 25493.8,
    "coeff": 100.0
  },
  {
    "name": "end-of-five-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 25542.8,
    "coeff": 100.0
  },
  {
    "name": "end-of-five-months-of-abaddon-apollyon-and-the-host-of-the-bottomless-pit100d",
    "ns": "sfo26",
    "ztp": 17262.8,
    "coeff": 100.0
  },
  {
    "name": "execution-of-the-total-project-development-process-yj",
    "ns": "sfo26",
    "ztp": 17651.8,
    "coeff": 360.0
  },
  {
    "name": "fifth-trumpet-a-star-falls-from-heaven-to-earth-and-opens-bottomless-pit-with-key100d",
    "ns": "sfo26",
    "ztp": 17112.8,
    "coeff": 100.0
  },
  {
    "name": "fifth-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 25392.8,
    "coeff": 100.0
  },
  {
    "name": "first-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 23952.8,
    "coeff": 100.0
  },
  {
    "name": "first-trumpet-hail-fire-mingled-with-blood-cast-upon-earth100d",
    "ns": "sfo26",
    "ztp": 15672.8,
    "coeff": 100.0
  },
  {
    "name": "fourth-trumpet-a-third-part-of-the-sun-moon-and-stars-are-smitten100d",
    "ns": "sfo26",
    "ztp": 16752.8,
    "coeff": 100.0
  },
  {
    "name": "fourth-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 25032.8,
    "coeff": 100.0
  },
  {
    "name": "general-and-state-examination-of-common-phenomena-effluent-from-the-shulammite-singularity-culminating-in-the-gogid100d-feast-of-tabernacles100d",
    "ns": "sfo26",
    "ztp": 18660.0,
    "coeff": 100.0
  },
  {
    "name": "second-trumpet-a-great-mountain-burning-with-fire-is-cast-into-the-sea100d",
    "ns": "sfo26",
    "ztp": 16032.8,
    "coeff": 100.0
  },
  {
    "name": "second-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 24312.8,
    "coeff": 100.0
  },
  {
    "name": "sixth-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 25931.8,
    "coeff": 100.0
  },
  {
    "name": "sixth-seal-the-vision-the-great-day-of-his-wrath-is-come-who-can-stand-exe-tpdp-end-of-day1-of-making-wedding100d",
    "ns": "sfo26",
    "ztp": 17651.8,
    "coeff": 100.0
  },
  {
    "name": "sixth-seal-zero-100d",
    "ns": "sfo26",
    "ztp": 17640.0,
    "coeff": 100.0
  },
  {
    "name": "sixth-seal-zero-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 25920.0,
    "coeff": 100.0
  },
  {
    "name": "sixth-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 25752.8,
    "coeff": 100.0
  },
  {
    "name": "sixth-trumpet-the-four-angels-bound-in-the-great-river-euphrates-are-loosed100d",
    "ns": "sfo26",
    "ztp": 17472.8,
    "coeff": 100.0
  },
  {
    "name": "the-power-of-the-manchild-100d",
    "ns": "sfo26",
    "ztp": 24279.0,
    "coeff": 100.0
  },
  {
    "name": "third-trumpet-a-great-star-called-wormwood-falls-from-heaven-burning-as-a-lamp-waters-made-bitter100d",
    "ns": "sfo26",
    "ztp": 16392.8,
    "coeff": 100.0
  },
  {
    "name": "third-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo26",
    "ztp": 24672.8,
    "coeff": 100.0
  },
  {
    "name": "fully-developed-subset-of-the-abstract-of-projects-at-ztps17640-proper-metric",
    "ns": "sfo27",
    "ztp": 17640.0,
    "coeff": 1.0
  },
  {
    "name": "manifestation-of-the-mystery-the-zero-banker-seven-d",
    "ns": "sfo27",
    "ztp": 17150.0,
    "coeff": 7.0
  },
  {
    "name": "make-to-yourselves-friends-of-the-mammon-of-unrighteousness-that-when-ye-fail-they-may-receive-you-into-everlasting-habitations-ztp-at-wild-sweet-potato-forage-with-chimdi-and-honest-inverter-negotiation-with-chira100d",
    "ns": "sfo28",
    "ztp": 19920.0,
    "coeff": 100.0
  },
  {
    "name": "revott-s2-14pt955-360d-implies-ztp-at-5tw-lawrence-livermore-lab-nuclear-fusion-breakthrough-implies-jephthahs-awful-sacrifice-of-daughter-100d",
    "ns": "sfo28",
    "ztp": 19544.0,
    "coeff": 100.0
  },
  {
    "name": "the-destroyer-of-the-gentiles-is-on-his-way-to-perdition100d",
    "ns": "sfo28",
    "ztp": 19554.0,
    "coeff": 100.0
  },
  {
    "name": "the-destroyer-of-the-gentiles-is-on-his-way-to-perdition100d-enter",
    "ns": "sfo28",
    "ztp": 19544.0,
    "coeff": 100.0
  },
  {
    "name": "the-destroyer-of-the-gentiles-is-on-his-way-to-perdition100d-leave",
    "ns": "sfo28",
    "ztp": 19560.0,
    "coeff": 100.0
  },
  {
    "name": "the-work-of-god-is-tried-with-fire100d",
    "ns": "sfo28",
    "ztp": 19451.8,
    "coeff": 100.0
  },
  {
    "name": "babylon-the-great-emergence-and-rise-and-fall-ztsuhiacuudztp1-stwo82pt80-w",
    "ns": "sfo29",
    "ztp": 19330.0,
    "coeff": 48.3
  },
  {
    "name": "zero-trade-salvation-from-ca-tontine-coffee-shop--to-euronext-nyse-etal-yg",
    "ns": "sfo29",
    "ztp": -10686.0,
    "coeff": 48.3
  },
  {
    "name": "zero-trade-salvation-from-ca-under-the-buttonwood-tree--to-euronext-nyse-etal-yg",
    "ns": "sfo29",
    "ztp": -10910.0,
    "coeff": 48.3
  },
  {
    "name": "zero-trade-salvation-universe-absolute-centralization-unto-utter-decentralization-ztp1-eigenfunction35280ddiv48pt3",
    "ns": "sfo29",
    "ztp": -10910.0,
    "coeff": 1.0
  },
  {
    "name": "zero-trade-salvation-universe-absolute-centralization-unto-utter-decentralization-ztp2-eigenfunction35280ddiv48pt3",
    "ns": "sfo29",
    "ztp": -10686.0,
    "coeff": 1.0
  },
  {
    "name": "a-time-of-trouble-the-tribulation-of-those-days-thou-art-my-battleaxe-enter-yj",
    "ns": "sfo30",
    "ztp": 17400.0,
    "coeff": 360.0
  },
  {
    "name": "a-time-of-trouble-the-tribulation-of-those-days-thou-art-my-battleaxe-leave-yj",
    "ns": "sfo30",
    "ztp": 17651.8,
    "coeff": 360.0
  },
  {
    "name": "deliverance0-ztp16571pt8-went-forth-conquering-and-to-conquer-yj",
    "ns": "sfo30",
    "ztp": 16571.8,
    "coeff": 360.0
  },
  {
    "name": "deliverance1-ztp16680-iron-yj",
    "ns": "sfo30",
    "ztp": 16680.0,
    "coeff": 360.0
  },
  {
    "name": "deliverance2-ztp16709-birth-of-jesus-christ-yj",
    "ns": "sfo30",
    "ztp": 16709.0,
    "coeff": 360.0
  },
  {
    "name": "deliverance4-ztp16719-at-calvary-the-world-is-delivered-of-a-manchild-destined-to-rule-all-nations-with-a-rod-of-iron-yj",
    "ns": "sfo30",
    "ztp": 16719.0,
    "coeff": 360.0
  },
  {
    "name": "feasts-of-the-lord-in-the-great-jubilee-year1965to2034andbeyond-in-standard-form700d",
    "ns": "sfo30",
    "ztp": -1696.5217391306596,
    "coeff": 700.0
  },
  {
    "name": "feasts-of-the-lord-in-the-great-jubilee-year1965to2034andbeyond700d-hsotp-enter",
    "ns": "sfo30",
    "ztp": -1800.0,
    "coeff": 700.0
  },
  {
    "name": "feasts-of-the-lord-in-the-great-jubilee-year1965to2034andbeyond700d-hsotp-leave",
    "ns": "sfo30",
    "ztp": 0.0,
    "coeff": 700.0
  },
  {
    "name": "judgment1-pleading-against-the-host-of-the-kingdom-of-darkness-enter-yj",
    "ns": "sfo30",
    "ztp": 18731.8,
    "coeff": 360.0
  },
  {
    "name": "judgment1-pleading-against-the-host-of-the-kingdom-of-darkness-leave-yj",
    "ns": "sfo30",
    "ztp": 18912.8,
    "coeff": 360.0
  },
  {
    "name": "judgment1-pleading-against-the-host-of-the-kingdom-of-darkness-preamble-yj",
    "ns": "sfo30",
    "ztp": 18552.8,
    "coeff": 360.0
  },
  {
    "name": "judgment2-unto-hamonah-and-the-valley-of-hamongog-enter-yj",
    "ns": "sfo30",
    "ztp": 21628.0,
    "coeff": 360.0
  },
  {
    "name": "judgment2-unto-hamonah-and-the-valley-of-hamongog-leave-yj",
    "ns": "sfo30",
    "ztp": 21720.0,
    "coeff": 360.0
  },
  {
    "name": "judgment3-even-unto-three-and-twenty-years-circumspection-ztp-at-22692tnldy-yj",
    "ns": "sfo30",
    "ztp": 22692.0,
    "coeff": 360.0
  },
  {
    "name": "judgment3-even-unto-three-and-twenty-years-gogid-ztp-at-22440tnldy-yj",
    "ns": "sfo30",
    "ztp": 22440.0,
    "coeff": 360.0
  },
  {
    "name": "judgments-of-which-we-have-not-heard10000d",
    "ns": "sfo30",
    "ztp": 0.0,
    "coeff": 10000.0
  },
  {
    "name": "judgments-of-which-we-have-not-heard7000d-atyequalsminus18",
    "ns": "sfo30",
    "ztp": -1800.0,
    "coeff": 7000.0
  },
  {
    "name": "judgments-of-which-we-have-not-heard7000d-atyequalszero",
    "ns": "sfo30",
    "ztp": 0.0,
    "coeff": 7000.0
  },
  {
    "name": "on-the-money1-pleading-against-the-kingdom-of-darkness-yj",
    "ns": "sfo30",
    "ztp": 18794.8,
    "coeff": 360.0
  },
  {
    "name": "on-the-money2-pleading-against-the-kingdom-of-darkness-yj",
    "ns": "sfo30",
    "ztp": 18892.8,
    "coeff": 360.0
  },
  {
    "name": "the-lord-shall-judge-his-people700d-atyequalsminus18",
    "ns": "sfo30",
    "ztp": -1800.0,
    "coeff": 700.0
  },
  {
    "name": "the-lord-shall-judge-his-people700d-atyequalszero",
    "ns": "sfo30",
    "ztp": 0.0,
    "coeff": 700.0
  },
  {
    "name": "unto-the-judgement-unto-the-rest-the-joy-of-our-lord",
    "ns": "sfo31",
    "ztp": 9722.471428571429,
    "coeff": 7.0
  },
  {
    "name": "at-the-end-of-twenty-years-7200days-100d",
    "ns": "sfo32",
    "ztp": 21360.0,
    "coeff": 100.0
  },
  {
    "name": "at-the-end-of-twenty-years-7200days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo32",
    "ztp": 29640.0,
    "coeff": 100.0
  },
  {
    "name": "foundation1-1080days-100d",
    "ns": "sfo32",
    "ztp": 15240.0,
    "coeff": 100.0
  },
  {
    "name": "foundation1-1080days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo32",
    "ztp": 23520.0,
    "coeff": 100.0
  },
  {
    "name": "foundation2-1440days-100d",
    "ns": "sfo32",
    "ztp": 15600.0,
    "coeff": 100.0
  },
  {
    "name": "foundation2-1440days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo32",
    "ztp": 23880.0,
    "coeff": 100.0
  },
  {
    "name": "great-white-throne-unto-the-judgement-unto-the-rest-the-joy-of-our-lord",
    "ns": "sfo32",
    "ztp": 17640.0,
    "coeff": 48.3
  },
  {
    "name": "my-own-house-4680days-100d",
    "ns": "sfo32",
    "ztp": 18840.0,
    "coeff": 100.0
  },
  {
    "name": "my-own-house-4680days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo32",
    "ztp": 27120.0,
    "coeff": 100.0
  },
  {
    "name": "the-temple-2520days-100d",
    "ns": "sfo32",
    "ztp": 16680.0,
    "coeff": 100.0
  },
  {
    "name": "the-temple-2520days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo32",
    "ztp": 24960.0,
    "coeff": 100.0
  },
  {
    "name": "withstood-me-one-and-twenty-7560days-100d",
    "ns": "sfo32",
    "ztp": 21720.0,
    "coeff": 100.0
  },
  {
    "name": "withstood-me-one-and-twenty-7560days-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo32",
    "ztp": 30000.0,
    "coeff": 100.0
  },
  {
    "name": "acc-5tw-tidb-tac-blackwhole-ztp11940-dnps1000d",
    "ns": "sfo33",
    "ztp": 11940.0,
    "coeff": 1000.0
  },
  {
    "name": "acc-5tw-tidb-tac-blackwhole-ztp12000-dnps1000d",
    "ns": "sfo33",
    "ztp": 12000.0,
    "coeff": 1000.0
  },
  {
    "name": "acc-5tw-tidb-tac-blackwhole-ztp12060-dnps1000d",
    "ns": "sfo33",
    "ztp": 12060.0,
    "coeff": 1000.0
  },
  {
    "name": "acc-document-begin-cleanse-after-armageddon-40yg-view-nene-maryann-ijioma-ztp11850-yg",
    "ns": "sfo33",
    "ztp": 11850.0,
    "coeff": 365.21739130434787
  },
  {
    "name": "alien-corridor-creation-m1908-gogid-end2-seventh-king-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20532.0,
    "coeff": 100.0
  },
  {
    "name": "alien-corridor-creation-m1960-gogid-end1-seventh-king-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20480.0,
    "coeff": 100.0
  },
  {
    "name": "alien-corridor-creation100d-ztp12200",
    "ns": "sfo33",
    "ztp": 12200.0,
    "coeff": 100.0
  },
  {
    "name": "alien-corridor-creation100d-ztp12252",
    "ns": "sfo33",
    "ztp": 12252.0,
    "coeff": 100.0
  },
  {
    "name": "commence-save-ueo-at-all-cost-ca-70-week-death-march-m2420-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20020.0,
    "coeff": 100.0
  },
  {
    "name": "commence-save-ueo-at-all-cost-ca-70-week-death-march-ztp11740",
    "ns": "sfo33",
    "ztp": 11740.0,
    "coeff": 100.0
  },
  {
    "name": "dark-night1-m2160-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20280.0,
    "coeff": 100.0
  },
  {
    "name": "dark-night3-m2100-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20340.0,
    "coeff": 100.0
  },
  {
    "name": "dark-nignt-of-the-prophets-soul-yg-ztp12000",
    "ns": "sfo33",
    "ztp": 12000.0,
    "coeff": 365.21739130434787
  },
  {
    "name": "dark-nignt-of-the-prophets-soul-yj-ztp12000",
    "ns": "sfo33",
    "ztp": 12000.0,
    "coeff": 360.0
  },
  {
    "name": "dark-nignt-of-the-prophets-soul-yj-ztp12060",
    "ns": "sfo33",
    "ztp": 12060.0,
    "coeff": 360.0
  },
  {
    "name": "dark-nignt-of-the-prophets-soul100d-ztp12000",
    "ns": "sfo33",
    "ztp": 12000.0,
    "coeff": 100.0
  },
  {
    "name": "dark-nignt-of-the-prophets-soul100d-ztp12060",
    "ns": "sfo33",
    "ztp": 12060.0,
    "coeff": 100.0
  },
  {
    "name": "dnps-begin-cleanse1-40yj-view-ztp12052-what-overflowing-army-is-overcoming-the-inordinacy-in-me-and-establishing-the-new-creature-in-the-end-times-yj",
    "ns": "sfo33",
    "ztp": 12052.17391304348,
    "coeff": 360.0
  },
  {
    "name": "dnps-begin-cleanse2-40yj-view-ztp12060-what-overflowing-army-is-overcoming-the-inordinacy-in-me-and-establishing-the-new-creature-in-the-end-times-yj",
    "ns": "sfo33",
    "ztp": 12060.0,
    "coeff": 360.0
  },
  {
    "name": "dnps-end-cleanse1-40yg-view-ztp12052-what-overflowing-army-is-overcoming-the-inordinacy-in-me-and-establishing-the-new-creature-in-the-end-times-yg",
    "ns": "sfo33",
    "ztp": 12052.17391304348,
    "coeff": 365.21739130434787
  },
  {
    "name": "dnps-end-cleanse2-40yg-view-ztp12060-what-overflowing-army-is-overcoming-the-inordinacy-in-me-and-establishing-the-new-creature-in-the-end-times-yg",
    "ns": "sfo33",
    "ztp": 12060.0,
    "coeff": 365.21739130434787
  },
  {
    "name": "ebe-city-complex-m1908-gogid-end2-seventh-king-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20532.0,
    "coeff": 100.0
  },
  {
    "name": "ebe-city-complex-m1960-gogid-end1-seventh-king-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20480.0,
    "coeff": 100.0
  },
  {
    "name": "ebe-city-complex100d-ztp12200",
    "ns": "sfo33",
    "ztp": 12200.0,
    "coeff": 100.0
  },
  {
    "name": "ebe-city-complex100d-ztp12252",
    "ns": "sfo33",
    "ztp": 12252.0,
    "coeff": 100.0
  },
  {
    "name": "fifty-bank-documents-end-armageddon-40yg-view-nene-maryann-ijioma-ztp11820-yg",
    "ns": "sfo33",
    "ztp": 11820.0,
    "coeff": 365.21739130434787
  },
  {
    "name": "ten-days-unto-the-alternative-havens10d-tah",
    "ns": "sfo34",
    "ztp": 11503.9,
    "coeff": 23.0
  },
  {
    "name": "neutral-organization-for-alternative-havens-alternative-haven-initiative-r12-y0",
    "ns": "sfo35",
    "ztp": 13699.5,
    "coeff": 100.0
  },
  {
    "name": "neutral-organization-for-alternative-havens-alternative-haven-initiative-r82pt80-y0",
    "ns": "sfo35",
    "ztp": 13770.3,
    "coeff": 100.0
  },
  {
    "name": "neutral-organization-for-alternative-havens-alternative-haven-initiative-r82pt80-y70",
    "ns": "sfo35",
    "ztp": 14260.3,
    "coeff": 100.0
  },
  {
    "name": "neutral-organization-for-alternative-havens-alternative-haven-initiative-rminus21pt60-yminus21pt60",
    "ns": "sfo35",
    "ztp": 13514.7,
    "coeff": 100.0
  },
  {
    "name": "threepp-noah-belief-propagation-proper",
    "ns": "sfo35",
    "ztp": 13687.5,
    "coeff": 108.0
  },
  {
    "name": "kings-leaving3500d",
    "ns": "sfo36",
    "ztp": -59661.95687,
    "coeff": 3500.0
  },
  {
    "name": "napoleon-entering3500d",
    "ns": "sfo36",
    "ztp": -82936.95687,
    "coeff": 3500.0
  },
  {
    "name": "the-seventy-weeks-of-the-seventh-king-7d",
    "ns": "sfo36",
    "ztp": 20000.0,
    "coeff": 7.0
  },
  {
    "name": "the-symbolic-synodic-period-of-venus-a-time-of-the-gentiles-as-read-from-kings-leaving3500d-and-containing-the-seventy-weeks-of-daniel350d",
    "ns": "sfo36",
    "ztp": 8625.0,
    "coeff": 350.0
  },
  {
    "name": "cleansing-ca-jesus-christ-tnldy18286-dob-all-the-land-with-all-judgment2800ddiv23",
    "ns": "sfo37",
    "ztp": 18286.087086956482,
    "coeff": 121.73913043478261
  },
  {
    "name": "cleansing-ca-virgin-mary-tnldy18242-dob-all-the-land-with-all-judgment2800ddiv23",
    "ns": "sfo37",
    "ztp": 18242.434782608696,
    "coeff": 121.73913043478261
  },
  {
    "name": "fortynine-times-onehundred-years-determined-in-patriarchview100yj",
    "ns": "sfo37",
    "ztp": -1762456.522,
    "coeff": 36000.0
  },
  {
    "name": "seventy-times-seventy-years-determined70yg",
    "ns": "sfo37",
    "ztp": -1756336.5,
    "coeff": 48.3
  },
  {
    "name": "seventy-times-seventy-years-determined70yj",
    "ns": "sfo37",
    "ztp": -1765696.522,
    "coeff": 25200.0
  },
  {
    "name": "birth-of-the-fig-tree-ca-minustwoonesixzero-yj",
    "ns": "sfo38",
    "ztp": -2172.6190476190473,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-ca-oneoneonesixzero-yj",
    "ns": "sfo38",
    "ztp": 11181.3,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-eighttwoeightzero-yj",
    "ns": "sfo38",
    "ztp": 8280.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-eighttwosixfive-yj",
    "ns": "sfo38",
    "ztp": 8265.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-minuseighteightnine-yj-clock",
    "ns": "sfo38",
    "ztp": -889.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-minusoneeightzerozero-yj",
    "ns": "sfo38",
    "ztp": -1800.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-minusoneonetwozero-yj",
    "ns": "sfo38",
    "ztp": -1120.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-minusonesixzerozero-yj",
    "ns": "sfo38",
    "ztp": -1600.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-minusonezerothreenine-yj",
    "ns": "sfo38",
    "ztp": -1039.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-minustwoonesixzero-yj",
    "ns": "sfo38",
    "ztp": -2160.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-oneoneonesixzero-yj",
    "ns": "sfo38",
    "ztp": 11160.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-zero-yj",
    "ns": "sfo38",
    "ztp": 0.0,
    "coeff": 360.0
  },
  {
    "name": "battle-for-the-new-nigeria-at-extremis100d",
    "ns": "sfo39",
    "ztp": 17221.434782079556,
    "coeff": 100.0
  },
  {
    "name": "reeducation-of-this-nigeria-the-university-of-hard-knocks-yg",
    "ns": "sfo39",
    "ztp": 11457.95652157,
    "coeff": 48.3
  },
  {
    "name": "reeducation-of-this-nigeria-the-university-of-hard-knocks-yj",
    "ns": "sfo39",
    "ztp": 11457.95652157,
    "coeff": 360.0
  },
  {
    "name": "reeducation-of-this-nigeria-the-university-of-hard-knocks100d",
    "ns": "sfo39",
    "ztp": 11457.95652157,
    "coeff": 100.0
  },
  {
    "name": "a-wind-of-doctrine-an-engaging-proposal-an-intriguing-prospect100d",
    "ns": "sfo40",
    "ztp": 14315.6,
    "coeff": 100.0
  },
  {
    "name": "a-holy-firstborn-from-the-matrix-reckoning-from-abraham-yg",
    "ns": "sfo41",
    "ztp": 7158.260869565218,
    "coeff": 48.3
  },
  {
    "name": "a-holy-firstborn-from-the-matrix-reckoning-from-jacob-yg",
    "ns": "sfo41",
    "ztp": 6573.913043478261,
    "coeff": 48.3
  },
  {
    "name": "unto-the-graduation-from-acolyte-to-sonoflight-unto-creator-amen-yg",
    "ns": "sfo41",
    "ztp": 7624.0,
    "coeff": 48.3
  },
  {
    "name": "unto-the-graduation-from-acolyte-to-sonoflight-unto-creator-amen-yj",
    "ns": "sfo41",
    "ztp": 7624.0,
    "coeff": 1.0
  },
  {
    "name": "unto-the-graduation-from-acolyte-to-sonoflight-unto-creator-amen100d",
    "ns": "sfo41",
    "ztp": 7624.0,
    "coeff": 1.0
  },
  {
    "name": "house-of-white-gold-yg",
    "ns": "sfo42",
    "ztp": 11570.0,
    "coeff": 48.3
  },
  {
    "name": "house-of-white-gold-yj",
    "ns": "sfo42",
    "ztp": 11570.0,
    "coeff": 360.0
  },
  {
    "name": "house-of-white-gold100d",
    "ns": "sfo42",
    "ztp": 11570.0,
    "coeff": 100.0
  },
  {
    "name": "a-rapture-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 24929.7,
    "coeff": 100.0
  },
  {
    "name": "a-rapture-occurs-circa-here100d",
    "ns": "sfo43",
    "ztp": 16649.7,
    "coeff": 100.0
  },
  {
    "name": "another-mighty-angel-clothed-with-a-cloud-and-a-rainbow-upon-his-head-and-his-face-as-it-were-the-sun-his-feet-as-pillars-of-fire-end-of-day49-of-making-wedding100d",
    "ns": "sfo43",
    "ztp": 17700.8,
    "coeff": 100.0
  },
  {
    "name": "another-mighty-angel-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 25980.8,
    "coeff": 100.0
  },
  {
    "name": "born-of-the-flesh-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 22440.0,
    "coeff": 100.0
  },
  {
    "name": "born-of-the-flesh-is-the-revelation-of-the-trial-revott-absolute-zero100d",
    "ns": "sfo43",
    "ztp": 14160.0,
    "coeff": 100.0
  },
  {
    "name": "fifth-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 25571.8,
    "coeff": 100.0
  },
  {
    "name": "fifth-seal-under-the-altar-the-souls-of-those-slain-for-the-word-of-god100d",
    "ns": "sfo43",
    "ztp": 17291.8,
    "coeff": 100.0
  },
  {
    "name": "fourth-seal-a-pale-horse-and-rider-death-and-hell-followed-with-him100d",
    "ns": "sfo43",
    "ztp": 16931.8,
    "coeff": 100.0
  },
  {
    "name": "fourth-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 25211.8,
    "coeff": 100.0
  },
  {
    "name": "gog-is-completely-empowered-and-the-ten-horns-hate-mystery-babylon-begin100d",
    "ns": "sfo43",
    "ztp": 16604.7,
    "coeff": 100.0
  },
  {
    "name": "having-subdued-three-kings-covenantprinceinc-requirement-to-rule-ie-mystery-babylon-sits-on-gog100d",
    "ns": "sfo43",
    "ztp": 13121.0,
    "coeff": 100.0
  },
  {
    "name": "having-subdued-three-kings-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 21401.0,
    "coeff": 100.0
  },
  {
    "name": "manchild-born-christmas-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 24269.0,
    "coeff": 100.0
  },
  {
    "name": "manchild-born-christmas-sun-and-moon-clothed-woman-flees-great-wrath-of-red-dragon-as-devil-comes-to-earth100d",
    "ns": "sfo43",
    "ztp": 15989.0,
    "coeff": 100.0
  },
  {
    "name": "manchild-born-easter-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 24279.0,
    "coeff": 100.0
  },
  {
    "name": "manchild-born-easter-sun-and-moon-clothed-woman-flees-great-wrath-of-red-dragon-as-devil-comes-to-earth100d",
    "ns": "sfo43",
    "ztp": 15999.0,
    "coeff": 100.0
  },
  {
    "name": "manchild-born-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 24279.0,
    "coeff": 100.0
  },
  {
    "name": "manchild-born-sun-and-moon-clothed-woman-flees-great-wrath-of-red-dragon-as-devil-comes-to-earth100d",
    "ns": "sfo43",
    "ztp": 15999.0,
    "coeff": 100.0
  },
  {
    "name": "one-of-the-seals-a-white-horse-and-its-rider-going-forth-conquering100d",
    "ns": "sfo43",
    "ztp": 15851.8,
    "coeff": 100.0
  },
  {
    "name": "one-of-the-seals-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 24131.8,
    "coeff": 100.0
  },
  {
    "name": "second-seal-a-red-horse-a-rider-a-great-sword-to-take-peace-from-earth100d",
    "ns": "sfo43",
    "ztp": 16211.8,
    "coeff": 100.0
  },
  {
    "name": "second-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 24491.8,
    "coeff": 100.0
  },
  {
    "name": "seventh-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 23771.8,
    "coeff": 100.0
  },
  {
    "name": "seventh-seal-half-hour-of-silence-as144000-are-sealed-before-overwhelming-rebukes-on-gog-and-his-hordes-commence100d",
    "ns": "sfo43",
    "ztp": 15491.8,
    "coeff": 100.0
  },
  {
    "name": "the-main-strain-shulammite-lineage-of-grace-through-faith-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 20640.0,
    "coeff": 100.0
  },
  {
    "name": "the-main-strain-shulammite-lineage-of-grace-through-faith-m1800-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 20640.0,
    "coeff": 100.0
  },
  {
    "name": "the-main-strain-shulammite-lineage-of-grace-through-faith-threeppnoah-omega-project-ideation-implies-arthur-george-consolidated-holdings-sealed-a-slave-forever-in-the-unlimited-company-etc-aimee-mungovan-zkpcdp-over-gogid100d",
    "ns": "sfo43",
    "ztp": 12360.0,
    "coeff": 100.0
  },
  {
    "name": "the-ten-horns-completely-burn-the-flesh-of-mystery-babylon-with-fire-finish100d",
    "ns": "sfo43",
    "ztp": 16861.0,
    "coeff": 100.0
  },
  {
    "name": "the-ten-horns-completely-burn-the-flesh-of-mystery-babylon-with-fire-start100d",
    "ns": "sfo43",
    "ztp": 16841.0,
    "coeff": 100.0
  },
  {
    "name": "the-ten-horns-completely-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 25121.0,
    "coeff": 100.0
  },
  {
    "name": "the-ten-horns-completely2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 25141.0,
    "coeff": 100.0
  },
  {
    "name": "the-two-prophets-the-lampstands-commence-testimony100d",
    "ns": "sfo43",
    "ztp": 16988.0,
    "coeff": 100.0
  },
  {
    "name": "the-two-prophets1-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 25268.0,
    "coeff": 100.0
  },
  {
    "name": "third-seal-a-black-horse-and-rider-a-pair-of-balances-in-his-hand-hurt-not-the-oil100d",
    "ns": "sfo43",
    "ztp": 16571.8,
    "coeff": 100.0
  },
  {
    "name": "third-seal-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 24851.8,
    "coeff": 100.0
  },
  {
    "name": "threeppnoah-global-turnaround-fullydeveloped250ddiv9",
    "ns": "sfo43",
    "ztp": 16340.0,
    "coeff": 18.0
  },
  {
    "name": "threeppnoah-ideation-cum-proposal-presentation-implies-arthur-george-consolidated-holdings-agch-sealed-a-slave-forever-in-the-unlimited-company-the-omega-project-aimee-mungovan-zkpcdp-etc-and-culminates-with-tie-in-to-background-onset-of-gogid100d",
    "ns": "sfo43",
    "ztp": 12360.0,
    "coeff": 100.0
  },
  {
    "name": "threeppnoah-ideation-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo43",
    "ztp": 20640.0,
    "coeff": 100.0
  },
  {
    "name": "miracle2-eigen-metric",
    "ns": "sfo44",
    "ztp": 12053.0,
    "coeff": 3.0
  },
  {
    "name": "revelation-of-the-trial-expanded-revotte-ie-proper-ie-eigen-diagonalization-metric200d",
    "ns": "sfo44",
    "ztp": 14160.0,
    "coeff": 1.0
  },
  {
    "name": "aimee-mungovan-recuperation-airborne-heartbreak-virus-vaccine-conception-nne-berna-rip-my-own-nucleus-rebels-access-girl-n14k-test-chidera-etal-desolate-chi-raptures-over-gsm-it-is-done-the-trial-expanded-streamline-at-y-equals37pt928",
    "ns": "sfo45",
    "ztp": 17952.8,
    "coeff": 1.0
  },
  {
    "name": "depositcheck-defense-of-the-algorithm-universe50ddiv18-linearized-from-m147pt60-to-p241pt20-full-development-of-birth50ddiv18",
    "ns": "sfo45",
    "ztp": 16840.0,
    "coeff": 2.7777777777777777
  },
  {
    "name": "depositcheck-execution-span-the-trial-fully-developed-rise-streamline-ie-at-y-equals26pt93",
    "ns": "sfo45",
    "ztp": 16853.0,
    "coeff": 1.0
  },
  {
    "name": "depositcheck-outflow-of-the-algorithm-of-the-proposal-universe50ddiv18-linearized-from-m147pt60-to-p241pt20-full-development-of-birth50ddiv18",
    "ns": "sfo45",
    "ztp": 16624.0,
    "coeff": 2.7777777777777777
  },
  {
    "name": "the-account-of-the-alien-corridor-proposal-the-trial-streamline-at-y-equals-m10pt39",
    "ns": "sfo45",
    "ztp": 13121.0,
    "coeff": 1.0
  },
  {
    "name": "the-rise-from-so-great-a-death-the-trial-equipotential-line-against-all-w-equal48pt00",
    "ns": "sfo45",
    "ztp": 18960.0,
    "coeff": 1.0
  },
  {
    "name": "trump-putin-the-seventh-kingdom-and-the-transition-the-trial-equipotential-line-against-all-w-equal43pt20",
    "ns": "sfo45",
    "ztp": 18480.0,
    "coeff": 1.0
  },
  {
    "name": "making-wedding-gentile-using-also-passion-and-desire-proper-metric",
    "ns": "sfo46",
    "ztp": 9893.0,
    "coeff": 1.0
  },
  {
    "name": "making-wedding-jew-using-also-passion-and-desire-proper-metric",
    "ns": "sfo46",
    "ztp": 9893.0,
    "coeff": 1.0
  },
  {
    "name": "marriage-wedding-miracle-making-wedding-gentile-streamline-at-y-equals0pt00",
    "ns": "sfo47",
    "ztp": 9893.0,
    "coeff": 6.9
  },
  {
    "name": "the-first-judgment-embodiment-of-the-saving-grace-cfh-making-wedding-jew-streamline-at-y-equals2pt01",
    "ns": "sfo47",
    "ztp": 10094.0,
    "coeff": 1.0
  },
  {
    "name": "end-of-day479-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo48",
    "ztp": 26410.8,
    "coeff": 100.0
  },
  {
    "name": "end-of-day479-of-making-wedding-and-his-wife-has-made-herself-ready-end100d",
    "ns": "sfo48",
    "ztp": 18130.8,
    "coeff": 100.0
  },
  {
    "name": "end-of-day483-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo48",
    "ztp": 26414.8,
    "coeff": 100.0
  },
  {
    "name": "end-of-day483-marriage-supper-of-the-lamb-begin-fine-linen-clean-and-white-ie-the-righteousness-of-the-saints-was-granted-to-her100d",
    "ns": "sfo48",
    "ztp": 18134.8,
    "coeff": 100.0
  },
  {
    "name": "end-of-day490-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo48",
    "ztp": 26421.0,
    "coeff": 100.0
  },
  {
    "name": "end-of-day490-marriage-supper-of-the-lamb-end100d",
    "ns": "sfo48",
    "ztp": 18141.0,
    "coeff": 100.0
  },
  {
    "name": "the-marriage-supper-the-approach-unto-the-rest-that-remains-proper-metric",
    "ns": "sfo48",
    "ztp": 15989.0,
    "coeff": 1.0
  },
  {
    "name": "ginika-umeano-the-depositcheck0-witness-questionmark-the-marriage-supper-streamline-at-y-equals9pt99",
    "ns": "sfo49",
    "ztp": 16988.0,
    "coeff": 1.0
  },
  {
    "name": "official-development-of-the-relationship-between-the-girl-of-new-york-and-i-questionmark-the-marriage-supper-streamline-at-y-equals21pt60",
    "ns": "sfo49",
    "ztp": 18148.0,
    "coeff": 1.0
  },
  {
    "name": "the-light-of-the-sun-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo49",
    "ztp": 26421.8,
    "coeff": 100.0
  },
  {
    "name": "the-light-of-the-sun-is-sevenfold-as-gog-taken-at-armageddon-finish100d",
    "ns": "sfo49",
    "ztp": 18148.0,
    "coeff": 100.0
  },
  {
    "name": "the-light-of-the-sun-is-sevenfold-as-gog-taken-at-armageddon-start100d",
    "ns": "sfo49",
    "ztp": 18141.8,
    "coeff": 100.0
  },
  {
    "name": "the-light-of-the-sun2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo49",
    "ztp": 26428.0,
    "coeff": 100.0
  },
  {
    "name": "the-marriage-supper-fully-developed-line-of-equipotential-ie-against-all-w-equal82pt80",
    "ns": "sfo49",
    "ztp": 24269.0,
    "coeff": 1.0
  },
  {
    "name": "end-of-seven-year-cleansing-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 29188.0,
    "coeff": 100.0
  },
  {
    "name": "end-of-the-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26458.0,
    "coeff": 100.0
  },
  {
    "name": "end-of-the-trumpet-judgments-then-shall-the-sanctuary-be-cleansed-seven-months-onset100d",
    "ns": "sfo50",
    "ztp": 18178.0,
    "coeff": 100.0
  },
  {
    "name": "fifth-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26192.8,
    "coeff": 100.0
  },
  {
    "name": "fifth-vial-on-seat-of-beast-his-kingdom-is-full-of-darkness100d",
    "ns": "sfo50",
    "ztp": 17912.8,
    "coeff": 100.0
  },
  {
    "name": "fourth-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26172.8,
    "coeff": 100.0
  },
  {
    "name": "fourth-vial-upon-the-sun-to-scorch-humans-with-fire100d",
    "ns": "sfo50",
    "ztp": 17892.8,
    "coeff": 100.0
  },
  {
    "name": "in-remembrance-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26274.782608695652,
    "coeff": 100.0
  },
  {
    "name": "in-remembrance-great-babylon-is-given-cup-of-wine-of-fierceness-of-gods-wrath100d",
    "ns": "sfo50",
    "ztp": 17994.782608695652,
    "coeff": 100.0
  },
  {
    "name": "second-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26132.8,
    "coeff": 100.0
  },
  {
    "name": "second-vial-the-sea-becomes-as-the-blood-of-a-dead-human-being100d",
    "ns": "sfo50",
    "ztp": 17852.8,
    "coeff": 100.0
  },
  {
    "name": "seven-year-cleansing-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26668.0,
    "coeff": 100.0
  },
  {
    "name": "seven-year-cleansing-of-all-the-land-ie-the-zkp-of-cfh-onset-enter100d",
    "ns": "sfo50",
    "ztp": 18360.0,
    "coeff": 100.0
  },
  {
    "name": "seven-year-cleansing-of-all-the-land-ie-the-zkp-of-cfh-start100d",
    "ns": "sfo50",
    "ztp": 18388.0,
    "coeff": 100.0
  },
  {
    "name": "seventh-trumpet-begins-to-sound-first-vial-a-noisome-grievous-sore-on-those-with-mark-of-beast100d",
    "ns": "sfo50",
    "ztp": 17832.8,
    "coeff": 100.0
  },
  {
    "name": "seventh-trumpet-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26112.8,
    "coeff": 100.0
  },
  {
    "name": "seventh-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26232.8,
    "coeff": 100.0
  },
  {
    "name": "seventh-vial-into-the-air-a-great-voice-out-of-the-temple-of-heaven-it-is-done-end-of-day301-of-making-wedding-and-his-wife-has-made-herself-ready-begin100d",
    "ns": "sfo50",
    "ztp": 17952.8,
    "coeff": 100.0
  },
  {
    "name": "sixth-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26212.8,
    "coeff": 100.0
  },
  {
    "name": "sixth-vial-great-river-euphrates-dries-up-to-prepare-way-of-kings-of-east100d",
    "ns": "sfo50",
    "ztp": 17932.8,
    "coeff": 100.0
  },
  {
    "name": "subset-of-the-revelation-of-the-seven-day-theory-proper-metric",
    "ns": "sfo50",
    "ztp": 12000.0,
    "coeff": 1.0
  },
  {
    "name": "the-end-of-the-seal-judgments",
    "ns": "sfo50",
    "ztp": 18011.8,
    "coeff": 100.0
  },
  {
    "name": "the-end-of-the-seal-judgments-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26291.8,
    "coeff": 100.0
  },
  {
    "name": "the-end-of-the-vial-judgments-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26252.8,
    "coeff": 100.0
  },
  {
    "name": "the-end-of-the-vial-judgments100d",
    "ns": "sfo50",
    "ztp": 17972.8,
    "coeff": 100.0
  },
  {
    "name": "the-lamb-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26040.0,
    "coeff": 100.0
  },
  {
    "name": "the-lamb-overcoming-the-ten-horns100d",
    "ns": "sfo50",
    "ztp": 17760.0,
    "coeff": 100.0
  },
  {
    "name": "the-two-prophets-the-lampstands-war-with-the-beast-end100d",
    "ns": "sfo50",
    "ztp": 17830.333333333332,
    "coeff": 100.0
  },
  {
    "name": "the-two-prophets-the-lampstands-war-with-the-beast-finish100d",
    "ns": "sfo50",
    "ztp": 17828.0,
    "coeff": 100.0
  },
  {
    "name": "the-two-prophets-the-lampstands-war-with-the-beast-start100d",
    "ns": "sfo50",
    "ztp": 17818.0,
    "coeff": 100.0
  },
  {
    "name": "the-two-prophets2-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26098.0,
    "coeff": 100.0
  },
  {
    "name": "the-two-prophets3-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26108.0,
    "coeff": 100.0
  },
  {
    "name": "the-two-prophets4-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26110.333333333332,
    "coeff": 100.0
  },
  {
    "name": "third-vial-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo50",
    "ztp": 26152.8,
    "coeff": 100.0
  },
  {
    "name": "third-vial-the-rivers-and-fountains-of-waters-become-blood100d",
    "ns": "sfo50",
    "ztp": 17872.8,
    "coeff": 100.0
  },
  {
    "name": "threeppnoah-idea-adoption-and-implementation-culminates-with-the-end-of-seven-year-cleansing-of-all-the-land-ie-the-zkp-of-cfh-ie-finish100d",
    "ns": "sfo50",
    "ztp": 20908.0,
    "coeff": 100.0
  },
  {
    "name": "threeppnoah-idea-adoption-and-implementation-three100d",
    "ns": "sfo50",
    "ztp": 21720.0,
    "coeff": 100.0
  },
  {
    "name": "threeppnoah-idea-adoption-and-implementation-two100d",
    "ns": "sfo50",
    "ztp": 21360.0,
    "coeff": 100.0
  },
  {
    "name": "the-blessed-and-glorious-hope-appearing-even-through-the-great-tribulation-unto-armageddon-and-beyond-amen-note-using-ztp16800",
    "ns": "sfo51",
    "ztp": 16800.0,
    "coeff": 1.0
  },
  {
    "name": "the-blessed-and-glorious-hope-appearing-even-through-the-great-tribulation-unto-armageddon-and-beyond-amen-note-using-ztp16848",
    "ns": "sfo51",
    "ztp": 16848.0,
    "coeff": 1.0
  },
  {
    "name": "the-blessed-and-glorious-hope-appearing-even-through-the-great-tribulation-unto-armageddon-and-beyond-amen-note-using-ztp16853",
    "ns": "sfo51",
    "ztp": 16853.0,
    "coeff": 1.0
  },
  {
    "name": "the-blessed-hope-and-the-glorious-appearing-proper",
    "ns": "sfo51",
    "ztp": 16800.0,
    "coeff": 1.0
  },
  {
    "name": "mystery-of-the-great-spouse-the-global-proper-of-tnl3d-universe-emanating-at-tnldy0",
    "ns": "sfo52",
    "ztp": 7200.0,
    "coeff": 1.0
  },
  {
    "name": "the-advent-of-the-daughter-proper-of-the-fullydeveloped-subset-of-tnl3d-universe-emanating-at-tnldy0",
    "ns": "sfo52",
    "ztp": 18360.0,
    "coeff": 1.0
  },
  {
    "name": "deposit-check-execution-span-the-seven-day-theory-fully-developed-rise-streamline-ie-at-y-equals48pt00",
    "ns": "sfo53",
    "ztp": 16800.0,
    "coeff": 1.0
  },
  {
    "name": "the-rise-from-so-great-a-death-the-seven-day-theory-equipotential-line-against-all-w-equal48pt00",
    "ns": "sfo53",
    "ztp": 16800.0,
    "coeff": 1.0
  },
  {
    "name": "born-of-the-flesh-enter100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-0pt00-on-revott",
    "ns": "sfo55",
    "ztp": 14160.0,
    "coeff": 100.0
  },
  {
    "name": "born-of-the-flesh-leave100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-6pt00-on-revott",
    "ns": "sfo55",
    "ztp": 14760.0,
    "coeff": 100.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-hemboss-sealenter100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-45pt718-on-revott",
    "ns": "sfo55",
    "ztp": 18731.8,
    "coeff": 100.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-hemboss-sealleave100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-49pt318-on-revott",
    "ns": "sfo55",
    "ztp": 19091.8,
    "coeff": 100.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-hemboss-trumpet100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-47pt528-on-revott",
    "ns": "sfo55",
    "ztp": 18912.8,
    "coeff": 100.0
  },
  {
    "name": "cfh-rapturing-through-family-friends-acquaintances-etc-ffae-enter100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-23pt71-on-revott",
    "ns": "sfo55",
    "ztp": 16531.0,
    "coeff": 100.0
  },
  {
    "name": "cfh-rapturing-through-family-friends-acquaintances-etc-ffae-leaveone100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-25pt20-on-revott",
    "ns": "sfo55",
    "ztp": 16680.0,
    "coeff": 100.0
  },
  {
    "name": "cfh-rapturing-through-family-friends-acquaintances-etc-ffae100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-24pt897-on-revott",
    "ns": "sfo55",
    "ztp": 16649.7,
    "coeff": 100.0
  },
  {
    "name": "sealed-a-slave-forever-in-m1800-the-unlimited-company-the-omega-project100d-because-of-sfobbminus18pt00-and-whose-ztp-is-s2minus18pt00-on-revott",
    "ns": "sfo55",
    "ztp": 12360.0,
    "coeff": 100.0
  },
  {
    "name": "sealed-a-slave-forever-in-the-unlimited-company-the-omega-project100d-because-of-sfobbminus18pt00-and-whose-ztp-is-s2minus18pt00-on-revott",
    "ns": "sfo55",
    "ztp": 12360.0,
    "coeff": 100.0
  },
  {
    "name": "shulam-she-that-is-of-me-the-new-nigeria100d-named-because-of-sfobbminus13pt32-and-whose-ztp-is-s2minus28pt80-on-revott",
    "ns": "sfo55",
    "ztp": 11280.0,
    "coeff": 100.0
  },
  {
    "name": "the-purpose-of-all-things-is-at-hand-ie-birth100d-because-of-sfobbzero-and-whose-ztp-is-s2-82pt80-on-revott",
    "ns": "sfo55",
    "ztp": 22440.0,
    "coeff": 100.0
  },
  {
    "name": "the-purpose-of-all-things-is-at-hand-ie-circumspection100d-because-of-sfobbzero-and-whose-ztp-is-s2-85pt32-on-revott",
    "ns": "sfo55",
    "ztp": 22692.0,
    "coeff": 100.0
  },
  {
    "name": "your-savings-are-good-you-have-the-right-idea-yg",
    "ns": "sfo55",
    "ztp": 17404.0,
    "coeff": 365.21739130434787
  },
  {
    "name": "unn-job-accepted-100d",
    "ns": "sfo56",
    "ztp": 11467.0,
    "coeff": 100.0
  },
  {
    "name": "unn-job-accepted-700div6pt9d",
    "ns": "sfo56",
    "ztp": 11467.0,
    "coeff": 101.44927536231883
  },
  {
    "name": "unn-job-accepted-yg",
    "ns": "sfo56",
    "ztp": 11467.0,
    "coeff": 365.21739130434787
  },
  {
    "name": "unn-job-accepted-yj",
    "ns": "sfo56",
    "ztp": 11467.0,
    "coeff": 360.0
  },
  {
    "name": "unn-job-offered-100d",
    "ns": "sfo56",
    "ztp": 11458.0,
    "coeff": 100.0
  },
  {
    "name": "unn-job-offered-700div6pt9d",
    "ns": "sfo56",
    "ztp": 11458.0,
    "coeff": 101.44927536231883
  },
  {
    "name": "unn-job-offered-yg",
    "ns": "sfo56",
    "ztp": 11458.0,
    "coeff": 365.21739130434787
  },
  {
    "name": "unn-job-offered-yj",
    "ns": "sfo56",
    "ztp": 11458.0,
    "coeff": 360.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-0pt00-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 15851.8,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-10pt80-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 17166.58260869565,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-111pt60-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 29437.88695652174,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-12pt41-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 17362.58260869565,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-13pt318-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 17473.121739130434,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-14pt40-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 17604.84347826087,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-18pt41-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 18093.017391304347,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-24pt41-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 18823.452173913043,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-25pt20-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 18919.626086956523,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-25pt928-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19008.252173913042,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-27pt00-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19138.75652173913,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-27pt41-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19188.66956521739,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-27pt718-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19226.165217391303,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-29pt528-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19446.513043478262,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-31pt318-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19664.426086956522,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-31pt50-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19686.58260869565,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-32pt40-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19796.147826086955,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-33pt128-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19884.77391304348,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-33pt58-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19939.8,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-34pt00-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 19990.930434782607,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-34pt10-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20003.104347826087,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-34pt918-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20102.68695652174,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-35pt418-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20163.55652173913,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-36pt728-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20323.034782608695,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-37pt928-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20469.121739130434,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-38pt128-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20493.46956521739,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-38pt347-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20520.23100189036,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-38pt518-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20540.94782608696,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-39pt362-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20643.734467548835,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-39pt60-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20672.66956521739,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-39pt88-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20706.75652173913,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-40pt18-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20743.278260869567,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-42pt28-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 20998.930434782607,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-50pt40-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 21987.452173913043,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-52pt92-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 22294.234782608695,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-56pt52-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 22732.49565217391,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-60pt12-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 23170.75652173913,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-63pt72-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 23609.017391304347,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-67pt32-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 24047.278260869567,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-67pt48-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 24066.75652173913,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-67pt68-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 24091.104347826087,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-6pt41-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 16632.147826086955,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-70pt92-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 24485.539130434783,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-72pt00-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 24617.017391304347,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-74pt52-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 24923.8,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-75pt60-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 25055.278260869567,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-78pt12-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 25362.06086956522,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-81pt72-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 25800.321739130435,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-82pt80-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 25931.8,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-85pt32-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 26238.58260869565,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus10pt39-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 14586.93043478261,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus147pt60-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 2115.104347826087,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus18pt00-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 13660.495652173913,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus19pt60-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 13465.713043478261,
    "coeff": 7.0
  },
  {
    "name": "seventy-weeks-of-range-minus19pt60-to-75pt60-is-at-minus6pt668-of-ten-days-tribulation-7d",
    "ns": "sfo01",
    "ztp": 15040.04347826087,
    "coeff": 7.0
  },
  {
    "name": "the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-design-point",
    "ns": "sfo01",
    "ztp": 18772.8,
    "coeff": 7.0
  },
  {
    "name": "the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-exit",
    "ns": "sfo01",
    "ztp": 18892.8,
    "coeff": 7.0
  },
  {
    "name": "the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-forty-days-prior-entry",
    "ns": "sfo01",
    "ztp": 18732.8,
    "coeff": 7.0
  },
  {
    "name": "the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-twenty-days-after-posterior-exit-for-total180day-ztp-interval",
    "ns": "sfo01",
    "ztp": 18912.8,
    "coeff": 7.0
  },
  {
    "name": "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity-predestination-unto-the-immanence-in-nigeria7d",
    "ns": "sfo01",
    "ztp": 18991.304347826088,
    "coeff": 7.0
  },
  {
    "name": "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-cfhthruhembossztpdesignpoint1",
    "ns": "sfo01",
    "ztp": 18873.521739130436,
    "coeff": 7.0
  },
  {
    "name": "phdp-oage40yj-nkechichioma-osoka-imama1st-eyes-on-her1-fullchannel1000ddiv7",
    "ns": "sfo02",
    "ztp": 14623.602484472052,
    "coeff": 142.85714285714286
  },
  {
    "name": "phdp-oage40yj-nkechichioma-osoka-imama1st-eyes-on-her2-fullchannel1000ddiv7",
    "ns": "sfo02",
    "ztp": 14631.428571428572,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-0pt00-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 10440.0,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-18pt29-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 12269.0,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-18pt39-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 12279.0,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-21pt91-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 12631.304347826086,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-34pt918-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 13931.8,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-35pt418-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 13981.8,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-37pt928-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14232.8,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-38pt347-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14274.782608695652,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-39pt88-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14428.0,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-40pt18-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14457.391304347826,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-42pt28-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 14668.0,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-and-also-the-gentile-at-w-equals-minus18pt00-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv6pt9",
    "ns": "sfo06",
    "ztp": 8640.0,
    "coeff": 144.92753623188406
  },
  {
    "name": "eleven-curtains-of-the-shulammite-dark-night-of-the-prophets-soul-dnps-and-also-the-gentile-eigen-proper-16900ddiv69",
    "ns": "sfo06",
    "ztp": 10440.0,
    "coeff": 244.92753623188406
  },
  {
    "name": "eleven-curtains-of-the-shulammite-dark-night-of-the-prophets-soul-dnps-the-jew-first-eigen-proper-1700ddiv7",
    "ns": "sfo06",
    "ztp": 10611.42857142857,
    "coeff": 242.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-0pt00-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 10611.42857142857,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-18pt29-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 12440.42857142857,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-18pt39-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 12450.42857142857,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-21pt91-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 12802.732919254659,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-34pt918-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14103.228571428572,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-35pt418-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14153.228571428572,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-37pt928-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14404.228571428572,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-38pt347-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14446.211180124224,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-39pt88-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14599.42857142857,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-40pt18-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14628.819875776397,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-42pt28-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 14839.42857142857,
    "coeff": 142.85714285714286
  },
  {
    "name": "eleven-curtains-the-jew-first-at-w-equals-minus18pt00-which-is-one-to-one-with-value-on-gogiddot100d-1000ddiv7",
    "ns": "sfo06",
    "ztp": 8811.42857142857,
    "coeff": 142.85714285714286
  },
  {
    "name": "shulam-she-that-is-of-me-the-new-nigeria100d",
    "ns": "sfo06",
    "ztp": 11280.0,
    "coeff": 100.0
  },
  {
    "name": "shulam-the-queen-sdq1000ddiv7",
    "ns": "sfo06",
    "ztp": 10611.42857142857,
    "coeff": 142.85714285714286
  },
  {
    "name": "ten-days-tribulation-10dt-eigen-proper-equation-2961ddiv23",
    "ns": "sfo06",
    "ztp": 15851.8,
    "coeff": 128.7391304347826
  },
  {
    "name": "and-arms-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23559.217142857142,
    "coeff": 100.0
  },
  {
    "name": "and-arms-shall-stand-on-his-part100d",
    "ns": "sfo08",
    "ztp": 15279.217142857144,
    "coeff": 100.0
  },
  {
    "name": "he-shall-confirm-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo08",
    "ztp": 23594.702857142856,
    "coeff": 100.0
  },
  {
    "name": "he-shall-confirm-the-covenant-with-many-for-one-week-start100d",
    "ns": "sfo08",
    "ztp": 15314.702857142856,
    "coeff": 100.0
  },
  {
    "name": "within-few-days-raiser-of-taxes-is-destroyed-not-in-battle-nor-in-anger100d",
    "ns": "sfo08",
    "ztp": 12520.0,
    "coeff": 100.0
  },
  {
    "name": "tnl1000",
    "ns": "sfo10",
    "ztp": 0.0,
    "coeff": 1000.0
  },
  {
    "name": "ztnl",
    "ns": "sfo10",
    "ztp": 0.0,
    "coeff": 1.0
  },
  {
    "name": "cfh-flowing-through-the-creature-which-god-has-made-strong-for-himself-heavily-encrypted-machine-biometric-system-s-hemboss-setting1-100d",
    "ns": "sfo11",
    "ztp": 18827.704347826086,
    "coeff": 100.0
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss-enter-yg",
    "ns": "sfo11",
    "ztp": 18772.5,
    "coeff": 365.2173913043478
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss-enter100d",
    "ns": "sfo11",
    "ztp": 18772.5,
    "coeff": 100.0
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss-enter360d",
    "ns": "sfo11",
    "ztp": 18772.5,
    "coeff": 360.0
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss-leave-yg",
    "ns": "sfo11",
    "ztp": 18892.5,
    "coeff": 365.2173913043478
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss-leave100d",
    "ns": "sfo11",
    "ztp": 18892.5,
    "coeff": 100.0
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss-leave360d",
    "ns": "sfo11",
    "ztp": 18892.5,
    "coeff": 360.0
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss-yg",
    "ns": "sfo11",
    "ztp": 18793.8,
    "coeff": 365.2173913043478
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss100d",
    "ns": "sfo11",
    "ztp": 18793.8,
    "coeff": 100.0
  },
  {
    "name": "the-creature-which-god-has-made-strong-for-himself-hemboss360d",
    "ns": "sfo11",
    "ztp": 18793.8,
    "coeff": 360.0
  },
  {
    "name": "ten-days-tribulation-unto-armageddon2800ddiv23",
    "ns": "sfo12",
    "ztp": 16282.6,
    "coeff": 121.73913043478261
  },
  {
    "name": "ten-days-tribulation2800ddiv23",
    "ns": "sfo12",
    "ztp": 15850.434782608696,
    "coeff": 121.73913043478261
  },
  {
    "name": "part1-embryo-genesis-seedling-plant-photosynthesis360d",
    "ns": "sfo14",
    "ztp": 15581.3,
    "coeff": 360.0
  },
  {
    "name": "part2-embryo-genesis-seedling-plant-photosynthesis240d",
    "ns": "sfo14",
    "ztp": 18731.8,
    "coeff": 240.0
  },
  {
    "name": "after-israel-comes-up-out-of-egypt-and-elders-overlive-joshua-at-ztp-ca-m1236496tnldy-unto-2nd-advent-of-the-lord-jesus-christ-36000d",
    "ns": "sfo18",
    "ztp": -1236496.5217391304,
    "coeff": 36000.0
  },
  {
    "name": "biomass-substrate-reconstitution-preprogram700div6pt9",
    "ns": "sfo21",
    "ztp": 9760.869565217392,
    "coeff": 101.44927536231884
  },
  {
    "name": "judgment-turns-in-favour-of-the-broken-stones-5561pt-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo23",
    "ztp": 28001.739130434784,
    "coeff": 100.0
  },
  {
    "name": "judgment-turns-in-favour-of-the-broken-stones-5587-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo23",
    "ztp": 28027.0,
    "coeff": 100.0
  },
  {
    "name": "judgment-turns-in-favour-of-the-broken-stones-set-at-naught-by-that-number-and-by-that-troop100d-revott-s2-at-5561pt",
    "ns": "sfo23",
    "ztp": 19721.739130434784,
    "coeff": 100.0
  },
  {
    "name": "judgment-turns-in-favour-of-the-broken-stones-set-at-naught-by-that-number-and-by-that-troop100d-revott-s2-at-5587",
    "ns": "sfo23",
    "ztp": 19747.0,
    "coeff": 100.0
  },
  {
    "name": "the-core-completion-matrix1-for-alien-corridor-creation-knowledge-is-increased-iron-is-not-mingled-but-can-react-at-singular-heat-with-miry-clay240d",
    "ns": "sfo23",
    "ztp": 10800.0,
    "coeff": 240.0
  },
  {
    "name": "the-core-completion-matrix2-for-alien-corridor-creation-knowledge-is-increased-iron-is-not-mingled-but-can-react-at-singular-heat-with-miry-clay240d",
    "ns": "sfo23",
    "ztp": 10853.0,
    "coeff": 240.0
  },
  {
    "name": "the-trial-ztp12000-a-minus-half-six-and-then-seventh-day-depiction-entering-into-a360-day-frame1-of-a-time-times-and-half-a-time-not-in-standard-form2400d",
    "ns": "sfo23",
    "ztp": 12000.0,
    "coeff": 2400.0
  },
  {
    "name": "days-i-month31028-pattern",
    "ns": "sfo24",
    "ztp": -11316.98913,
    "coeff": 1217.391304347826
  },
  {
    "name": "usa-dem-rev-sit-on-brit-emp",
    "ns": "sfo24",
    "ztp": -57542.0,
    "coeff": 1014.4927536231884
  },
  {
    "name": "usa-sit-tenyg",
    "ns": "sfo24",
    "ztp": -70611.45652,
    "coeff": 3652.1739130434785
  },
  {
    "name": "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-barebones-darkly-through-a-glass-prerecord-of-facebook-ruminations-on-the-order-for-the-rise-of-the-7th-king-cfhthruhembossztp18827pt81div115setting1",
    "ns": "sfo26",
    "ztp": 18827.704347826086,
    "coeff": 7.0
  },
  {
    "name": "tss-the-five-terawatt-project-and-the-intelligent-defence-body5tw-tidb-the-elusive-sixty-nine-week-singularity7d-on-paper-present-at-olokoro-for-the-loving-celebration-of-life-and-interrment-of-albert-onyenuloya-uhiara-cfhthruhembossztp18794pt8div10setting0",
    "ns": "sfo26",
    "ztp": 18794.8,
    "coeff": 7.0
  },
  {
    "name": "revott-s2-15pt341-360d-implies-ztp-at-definitively-linking-the-success-of-noah-atdf-to-fall-of-7th-and-8th-kings-implies-1st-year-of-king-david-reign-100d",
    "ns": "sfo28",
    "ztp": 19682.77542857143,
    "coeff": 100.0
  },
  {
    "name": "revott-s2-15pt367-360d-implies-ztp-at-20231007-realtime-50th-yom-kippur-anniversary-attack-on-israel-by-hamas-implies-beginnings-of-king-david-reign-in-jerusalem-100d",
    "ns": "sfo28",
    "ztp": 19692.239130434784,
    "coeff": 100.0
  },
  {
    "name": "revott-s2-15pt449-360d-implies-ztp-at-54pt00-tnlyg-ygbday-castigliano-failure-singularity-implies-1st-year-coreign-david-and-solomon-100d",
    "ns": "sfo28",
    "ztp": 19721.739130434784,
    "coeff": 100.0
  },
  {
    "name": "the-robin-hood-protocol-ahz-ahi-100d",
    "ns": "sfo28",
    "ztp": 19638.260869565216,
    "coeff": 100.0
  },
  {
    "name": "deliverance3-ztp16716pt52-jesus-christ-is-well-on-about-the-business-of-his-father-yj",
    "ns": "sfo30",
    "ztp": 16716.521739130436,
    "coeff": 360.0
  },
  {
    "name": "lives-of-the-rest-of-the-beasts-prolonged-a-season-and-a-time-7669days-their-end-is-literally-fulfilled-here-higgaion-selah-100d",
    "ns": "sfo32",
    "ztp": 21829.565217391304,
    "coeff": 100.0
  },
  {
    "name": "lives-of-the-rest-of-the-beasts-prolonged-a-season-and-a-time-7669days-their-end-is-literally-fulfilled-here-higgaion-selah-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo32",
    "ztp": 30109.565217391304,
    "coeff": 100.0
  },
  {
    "name": "alien-corridor-creation-m2333pt3333-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20106.666666666668,
    "coeff": 100.0
  },
  {
    "name": "alien-corridor-creation100d-ztp11826pt6667",
    "ns": "sfo33",
    "ztp": 11826.666666666666,
    "coeff": 100.0
  },
  {
    "name": "dark-night2-m2107-gogid-etc-with-bb-82pt80-ie-on-gogid-placed-as-ztp-100d",
    "ns": "sfo33",
    "ztp": 20332.17391304348,
    "coeff": 100.0
  },
  {
    "name": "dark-nignt-of-the-prophets-soul-yg-ztp12060",
    "ns": "sfo33",
    "ztp": 12060.0,
    "coeff": 365.2173913043478
  },
  {
    "name": "dark-nignt-of-the-prophets-soul100d-ztp12052pt17",
    "ns": "sfo33",
    "ztp": 12052.173913043478,
    "coeff": 100.0
  },
  {
    "name": "multiple-detonations-and-destructions-at-great-babylon-viscerally-shock-many-generational-slaves-and-servants-into-emancipation-from-among-the-chaos-attendant-at-her-destruction-360d",
    "ns": "sfo36",
    "ztp": 20477.391304347828,
    "coeff": 360.0
  },
  {
    "name": "seventh-king-uses-the-key-of-thermonuclear-war-to-open-the-bottomless-pit-and-let-out-the-ten-horns-mystery-babylon-a-raiser-of-taxes-the-eighth-king-etc-35d",
    "ns": "sfo36",
    "ztp": 19323.91304347826,
    "coeff": 35.0
  },
  {
    "name": "days-i",
    "ns": "sfo37",
    "ztp": -2946061.739,
    "coeff": 121739.1304347826
  },
  {
    "name": "days-ii",
    "ns": "sfo37",
    "ztp": -3616774795.0,
    "coeff": 148204158.7901701
  },
  {
    "name": "days-iii",
    "ns": "sfo37",
    "ztp": -4403060450000.0,
    "coeff": 180422454179.3375
  },
  {
    "name": "days-iv",
    "ns": "sfo37",
    "ztp": -5360247535000000.0,
    "coeff": 219644726827019.56
  },
  {
    "name": "days-one",
    "ns": "sfo37",
    "ztp": 22440.0,
    "coeff": 100.0
  },
  {
    "name": "days-v",
    "ns": "sfo37",
    "ztp": -6.525518738e+18,
    "coeff": 2.673935804850673e+17
  },
  {
    "name": "birth-of-the-fig-tree-minusninezerofour-yj",
    "ns": "sfo38",
    "ztp": -904.0,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-ztp-minus879tnldy-end-of-the-six-day-war-yj",
    "ns": "sfo38",
    "ztp": -878.9347826086956,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-ztp-minus884tnldy-start-of-the-six-day-war-yj",
    "ns": "sfo38",
    "ztp": -883.9347826086956,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-ztp-minus898tnldy-egypt-closes-the-straits-of-tiran-yj",
    "ns": "sfo38",
    "ztp": -897.9347826086956,
    "coeff": 360.0
  },
  {
    "name": "birth-of-the-fig-tree-ztp-minus904tnldy-egypt-begins-amassing-troops-on-israels-borders-yj",
    "ns": "sfo38",
    "ztp": -903.9347826086956,
    "coeff": 360.0
  },
  {
    "name": "the-redemption-of-a-people-scattered-and-peeled-terrible-from-their-beginning-hitherto-101dys31div69",
    "ns": "sfo38",
    "ztp": 10796.521739130434,
    "coeff": 101.44927536231884
  },
  {
    "name": "a-holy-firstborn-from-the-matrix-reckoning-from-isaac-yg",
    "ns": "sfo41",
    "ztp": 6797.634782608696,
    "coeff": 365.2173913043478
  },
  {
    "name": "a-holy-firstborn1-from-the-matrix-yg",
    "ns": "sfo41",
    "ztp": 6208.695652173913,
    "coeff": 365.2173913043478
  },
  {
    "name": "a-holy-firstborn2-from-the-matrix-yg",
    "ns": "sfo41",
    "ztp": 6573.913043478261,
    "coeff": 365.2173913043478
  },
  {
    "name": "a-holy-firstborn3-from-the-matrix-my-darling-beloved-soul-yg",
    "ns": "sfo41",
    "ztp": 6656.521739130435,
    "coeff": 365.2173913043478
  },
  {
    "name": "the-shulammite-sdq-global-dedicated-to-juliet-koji-iwu-jki-ie-proper-ie-eigen-diagonalization-metric1700ddiv7",
    "ns": "sfo44",
    "ztp": 10611.42857142857,
    "coeff": 242.85714285714286
  },
  {
    "name": "cfh-rapturing-through-family-friends-acquaintances-etc-ffae-leavetwo100d-because-of-sfobb0pt00-and-whose-ztp-is-s2-25pt56-on-revott",
    "ns": "sfo55",
    "ztp": 16716.521739130436,
    "coeff": 100.0
  },
  {
    "name": "dark-nignt-of-the-prophets-soul100d-named-because-of-sfobbzero-and-whose-ztp-is-s2minus21pt07-on-revott",
    "ns": "sfo55",
    "ztp": 12052.173913043478,
    "coeff": 100.0
  },
  {
    "name": "exe-tpdp-cognitive-hertz-frequency",
    "ns": "sfo55",
    "ztp": -25822.368553426928,
    "coeff": 57855469571780.93
  }
]`,N=`import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTheme } from "./App";

// ═══════════════════════════════════════════════════════════════════
// SFO-WAM ENGINE v2 — Autonomous PDP Causal Agent Backend
// 399 nodes · 701 edges · Four Operations: Observe · Propagate · Project · Judge
// d-Separation · Lock-in Registry · Projection Resolution · Digest Engine
// Parameterised by (A, C) for any agent in the 759-agent JOMO constellation
// ═══════════════════════════════════════════════════════════════════

// ── TNLDY TIME AUTHORITY ──
const EPOCH = 4703008911.6524158066013043478202;
const MSD = 86400000;
function tnldy(ms) { return (EPOCH + ms) / MSD; }
function tnldyNow() { return tnldy(Date.now()); }
function tnldyToMs(z) { return z * MSD - EPOCH; }
function tnldyToDate(z) { return new Date(tnldyToMs(z)); }
function agentY(z, A, C) { return A === 0 ? 0 : (z - C) / A; }
function agentZ(y, A, C) { return A * y + C; }
const DISPLAY_TIME_ZONE = "Africa/Lagos";
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: DISPLAY_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function fd(d) { if (!d || isNaN(d.getTime())) return "—"; return DATE_FORMAT.format(d); }
function ft(d) { if (!d || isNaN(d.getTime())) return ""; return TIME_FORMAT.format(d) + " WAT"; }

// ── 399 NODE Y-COORDINATES (sorted ascending) ──
const NODE_YS=[-147.6,-132.97,-126.3,-123.01,-120.97,-110.97,-104.4,-100.97,-98.3,-95.6,-91.56,-90.6,-83.19,-72.03,-61.2,-60.97,-43.2,-39.5984,-38.8,-37.5186,-36.4836,-35.5964,-34.9064,-34.2657,-32.6689,-32.14,-32.0281,-30.1849,-29.6329,-29.071,-28.6471,-28.5289,-28.3909,-27.6,-27.5629,-26.6264,-26.0843,-25.9,-24.7831,-23.8171,-23.6594,-23.4623,-22.5259,-22.4766,-22.4569,-22.1119,-21.9936,-21.8161,-21.6,-21.481,-21.1853,-20.8699,-20.5741,-20.2883,-19.5983,-19.1251,-19.1153,-19.0857,-19.0266,-18.9871,-18.859,-18.8294,-18.79,-18.6126,-18.6027,-18.2676,-18.1394,-18.0211,-18.0,-17.8733,-17.8437,-17.5283,-17.4396,-17.272,-17.2424,-17.134,-16.9664,-16.8383,-16.7397,-16.5721,-16.56,-16.4,-16.0497,-16.0,-15.6357,-15.2414,-15.0,-14.8471,-14.4529,-14.4,-14.1571,-14.0783,-13.684,-13.5066,-13.5,-13.32,-13.14,-12.96,-12.718,-12.5209,-12.42,-12.1266,-12.0576,-12.0,-11.7,-11.6633,-11.6337,-11.407,-11.34,-11.1901,-11.0127,-10.9536,-10.8846,-10.8254,-10.786,-10.7071,-10.6283,-10.51,-10.4311,-10.39,-10.2241,-9.8496,-9.8299,-9.4602,-9.4356,-9.3271,-9.18,-9.0659,-8.8984,-8.89,-8.8688,-8.8491,-8.8294,-8.5928,-8.5731,-8.5336,-8.5189,-8.4646,-8.4548,-8.302,-8.2823,-8.2379,-8.2182,-8.1394,-8.1295,-8.1,-8.0704,-8.0,-7.92,-7.8535,-7.6859,-7.6761,-7.6613,-7.5282,-7.3902,-7.38,-7.1241,-7.0156,-7.0107,-7.0098,-6.9113,-6.8915,-6.8776,-6.7199,-6.6944,-6.668,-6.6057,-6.5622,-6.56,-6.517,-6.452,-6.4341,-6.344,-6.3,-6.2764,-6.236,-6.128,-6.02,-6.0,-5.912,-5.804,-5.7342,-5.728,-5.7145,-5.696,-5.588,-5.5469,-5.48,-5.4089,-5.4065,-5.372,-5.298,-5.2956,-5.264,-5.1871,-5.156,-5.048,-4.94,-4.832,-4.724,-4.616,-4.508,-4.5,-4.4,-4.292,-4.184,-4.076,-3.968,-3.86,-3.752,-3.644,-3.536,-3.428,-3.32,-3.31,-3.212,-3.104,-2.996,-2.888,-2.78,-2.672,-2.564,-2.456,-2.348,-2.24,-2.132,-2.024,-1.916,-0.18,0.0,0.33,0.8,1.62,1.81,2.34,3.6,3.78,4.4,4.86,5.16,5.41,5.58,5.94,6.12,6.41,6.65,6.66,7.2,8.1,9.01,9.5687,9.72,9.99,10.8,10.95,11.1921,11.547,11.6919,11.8457,12.24,12.41,12.6,12.61,12.78,12.9,13.318,13.35,13.5993,14.4,14.608,14.76,14.82,14.95,15.128,16.21,16.918,17.22,17.32,17.71,18.0,18.29,18.39,18.41,18.728,19.65,19.81,20.0,20.186,20.34,20.41,20.42,20.518,21.6,21.913,22.32,22.328,23.41,23.61,23.71,23.81,24.01,24.118,24.21,24.27,24.29,24.2969,24.329,24.41,24.412,24.447,24.61,24.81,24.84,24.897,25.2,25.565,25.928,26.81,27.01,27.36,27.41,27.718,28.28,29.217,29.528,29.88,30.42,30.538,30.638,31.028,31.318,31.5,31.63,32.13,32.4,32.68,33.128,33.39,33.485,33.504,33.565,33.61,34.0,34.1,34.24,34.3,34.8,34.918,34.92,35.418,36.52,36.68,36.7033,36.715,36.728,36.928,37.112,37.128,37.328,37.44,37.528,37.728,37.928,38.128,38.3478,38.518,39.74,39.8,39.88,40.1739,42.28,42.86,45.0,47.52,50.04,52.56,55.08,57.6,60.12,62.64,65.16,67.48,67.68,70.2,72.0,72.72,73.043,75.24,75.6,76.695,77.76,80.28,82.8,85.68,87.84,97.2,111.6,183.6,212.4];

// ── 701 EDGES [fromIdx, toIdx, weight] ──
const EDGES_RAW=[[0,1,14.63],[0,6,43.2],[1,2,6.67],[2,3,3.29],[3,4,2.04],[4,5,10.0],[5,6,6.57],[6,7,3.43],[6,14,43.2],[7,8,2.67],[7,15,40.0],[8,9,2.7],[8,15,37.33],[9,10,4.04],[9,15,34.63],[10,11,0.96],[10,15,30.59],[11,12,7.41],[12,13,11.16],[13,14,10.83],[14,15,0.23],[14,16,18.0],[15,16,17.77],[16,17,3.6016],[17,18,0.7984],[17,26,7.5703],[17,54,20.0001],[17,290,60.0184],[17,326,70.0184],[18,19,1.2814],[18,28,9.1671],[19,20,1.035],[19,31,8.9897],[20,21,0.8872],[20,34,8.9207],[21,22,0.69],[21,35,8.97],[22,23,0.6407],[22,36,8.8221],[23,24,1.5968],[23,38,9.4826],[24,25,0.5289],[24,29,3.5979],[25,26,0.1119],[25,33,4.54],[26,27,1.8432],[26,43,9.5515],[27,28,0.552],[27,42,7.659],[28,29,0.5619],[29,30,0.4239],[30,31,0.1182],[30,39,4.83],[31,32,0.138],[32,33,0.7909],[32,58,9.3643],[33,34,0.0371],[33,37,1.7],[34,35,0.9365],[35,36,0.5421],[36,37,0.1843],[37,38,1.1169],[38,39,0.966],[39,40,0.1577],[39,59,4.83],[40,41,0.1971],[40,43,1.1828],[41,42,0.9364],[41,71,5.934],[42,43,0.0493],[43,44,0.0197],[43,48,0.8766],[44,45,0.345],[45,46,0.1183],[45,70,4.2682],[46,47,0.1775],[46,49,0.5126],[47,48,0.2161],[47,74,4.5737],[48,49,0.119],[48,53,1.3117],[49,50,0.2957],[49,55,2.3559],[50,51,0.3154],[50,61,2.3559],[50,257,2.1232],[51,52,0.2958],[51,64,2.2672],[52,53,0.2858],[52,56,1.4588],[53,54,0.69],[54,55,0.4732],[54,57,0.5126],[54,60,0.7393],[54,69,1.725],[55,56,0.0098],[56,57,0.0296],[57,58,0.0591],[57,60,0.2267],[58,59,0.0395],[59,60,0.1281],[59,90,4.83],[60,61,0.0296],[61,62,0.0394],[62,63,0.1774],[62,72,1.3504],[63,64,0.0099],[63,67,0.5915],[63,73,1.3406],[63,77,1.7743],[64,65,0.3351],[65,66,0.1282],[66,67,0.1183],[67,68,0.0211],[67,73,0.7491],[67,78,1.2814],[67,79,1.449],[67,80,1.4611],[68,69,0.1267],[68,229,18.0],[68,279,36.0],[69,70,0.0296],[70,71,0.3154],[71,72,0.0887],[72,73,0.1676],[73,74,0.0296],[74,75,0.1084],[75,76,0.1676],[75,77,0.2957],[75,78,0.3943],[75,79,0.5619],[75,82,1.0843],[76,77,0.1281],[77,78,0.0986],[78,79,0.1676],[79,80,0.0121],[80,81,0.16],[80,83,0.56],[81,82,0.3503],[82,83,0.0497],[83,84,0.3643],[83,85,0.7586],[84,85,0.3943],[84,87,0.7886],[84,88,1.1828],[85,86,0.2414],[86,87,0.1529],[86,103,3.0],[86,147,7.0],[87,88,0.3942],[88,89,0.0529],[89,90,0.2429],[89,94,0.9],[89,95,1.08],[89,96,1.26],[89,97,1.44],[90,91,0.0788],[90,125,4.83],[91,92,0.3943],[92,93,0.1774],[93,94,0.0066],[93,98,0.7886],[94,95,0.18],[95,96,0.18],[96,97,0.18],[97,98,0.242],[97,100,0.54],[98,99,0.1971],[99,100,0.1009],[99,101,0.3943],[100,101,0.2934],[100,104,0.72],[101,102,0.069],[102,103,0.0576],[102,105,0.3943],[103,104,0.3],[103,128,3.1016],[103,147,4.0],[104,105,0.0367],[104,108,0.36],[105,106,0.0296],[106,107,0.2267],[107,108,0.067],[107,109,0.2169],[108,109,0.1499],[108,126,2.16],[109,110,0.1774],[110,111,0.0591],[111,112,0.069],[112,113,0.0592],[113,114,0.0394],[113,116,0.1971],[113,118,0.3943],[113,120,0.6013],[113,121,0.9758],[114,115,0.0789],[115,116,0.0788],[116,117,0.1183],[116,118,0.1972],[117,118,0.0789],[117,119,0.12],[118,119,0.0411],[119,120,0.1659],[119,317,37.2],[120,121,0.3745],[120,122,0.3942],[121,122,0.0197],[122,123,0.3697],[123,124,0.0246],[124,125,0.1085],[124,169,2.9186],[125,126,0.1471],[125,127,0.2612],[125,202,4.8271],[126,127,0.1141],[126,145,1.08],[127,128,0.1675],[128,129,0.0084],[129,130,0.0212],[130,131,0.0197],[131,132,0.0197],[132,133,0.2366],[133,134,0.0197],[134,135,0.0395],[134,136,0.0542],[135,136,0.0147],[136,137,0.0543],[137,138,0.0098],[138,139,0.1528],[139,140,0.0197],[140,141,0.0444],[141,142,0.0197],[142,143,0.0788],[143,144,0.0099],[144,145,0.0295],[145,146,0.0296],[145,148,0.18],[146,147,0.0704],[147,148,0.08],[148,149,0.0665],[148,155,0.54],[149,150,0.1676],[150,151,0.0098],[151,152,0.0148],[152,153,0.1331],[153,154,0.138],[154,155,0.0102],[155,156,0.2559],[155,165,0.712],[156,157,0.1085],[157,158,0.0049],[158,159,0.0009],[159,160,0.0985],[160,161,0.0198],[161,162,0.0139],[162,163,0.1577],[163,164,0.0255],[164,165,0.0264],[164,166,0.0887],[165,166,0.0623],[165,168,0.108],[166,167,0.0435],[167,168,0.0022],[167,171,0.1281],[167,174,0.2858],[168,169,0.043],[168,170,0.108],[169,170,0.065],[170,171,0.0179],[170,172,0.108],[171,172,0.0901],[172,173,0.044],[172,175,0.108],[173,174,0.0236],[173,178,0.3],[173,182,0.572],[173,214,2.99],[173,229,6.3],[174,175,0.0404],[174,181,0.5422],[174,186,0.7295],[174,188,0.8675],[175,176,0.108],[176,177,0.108],[177,178,0.02],[177,179,0.108],[178,179,0.088],[178,182,0.272],[179,180,0.108],[180,181,0.0698],[180,184,0.108],[181,182,0.0062],[181,183,0.0197],[182,183,0.0135],[182,214,2.418],[182,229,5.728],[183,184,0.0185],[183,186,0.1676],[183,188,0.3056],[184,185,0.108],[185,186,0.0411],[185,187,0.108],[186,187,0.0669],[186,188,0.138],[187,188,0.0711],[187,190,0.108],[188,189,0.0024],[189,190,0.0345],[190,191,0.074],[190,193,0.108],[191,192,0.0024],[192,193,0.0316],[192,194,0.1085],[193,194,0.0769],[193,195,0.108],[194,195,0.0311],[194,202,0.6871],[195,196,0.108],[196,197,0.108],[197,198,0.108],[198,199,0.108],[199,200,0.108],[200,201,0.108],[201,202,0.008],[201,203,0.108],[202,203,0.1],[202,230,4.83],[203,204,0.108],[204,205,0.108],[205,206,0.108],[206,207,0.108],[207,208,0.108],[208,209,0.108],[209,210,0.108],[210,211,0.108],[211,212,0.108],[212,213,0.108],[213,214,0.01],[214,215,0.098],[214,229,3.31],[214,324,1.81],[215,216,0.108],[216,217,0.108],[217,218,0.108],[218,219,0.108],[219,220,0.108],[220,221,0.108],[221,222,0.108],[222,223,0.108],[223,224,0.108],[224,225,0.108],[225,226,0.108],[226,227,0.108],[227,228,2.096],[228,229,0.18],[228,232,1.44],[229,230,0.33],[229,231,0.8],[229,233,1.81],[229,235,3.6],[229,253,10.8],[229,254,10.95],[229,261,12.6],[229,263,12.78],[229,279,18.0],[229,293,21.913],[229,314,25.2],[229,315,25.565],[229,331,31.5],[229,364,38.3478],[229,384,72.0],[229,386,73.043],[229,388,75.6],[229,389,76.695],[230,231,0.47],[230,239,4.83],[231,232,0.82],[231,237,3.6],[232,233,0.19],[232,234,0.72],[233,234,0.53],[233,235,1.79],[234,235,1.26],[234,236,1.44],[235,236,0.18],[235,240,1.81],[235,247,3.6],[236,237,0.62],[236,238,1.08],[237,238,0.46],[238,239,0.3],[238,241,0.72],[239,240,0.25],[239,252,4.83],[240,241,0.17],[240,243,0.71],[240,247,1.79],[241,242,0.36],[242,243,0.18],[242,246,0.72],[243,244,0.29],[244,245,0.24],[244,259,5.83],[244,260,6.0],[245,246,0.01],[245,250,2.9187],[246,247,0.54],[247,248,0.9],[247,249,1.81],[247,253,3.6],[248,249,0.91],[249,250,0.5587],[249,251,0.71],[249,253,1.79],[249,255,2.1821],[250,251,0.1513],[250,255,1.6234],[250,257,2.1232],[251,252,0.27],[251,259,2.52],[252,253,0.81],[253,254,0.15],[253,255,0.3921],[253,262,1.81],[253,268,3.6],[254,255,0.2421],[255,256,0.3549],[256,257,0.1449],[256,261,1.053],[256,306,12.782],[256,356,25.565],[257,258,0.1538],[258,259,0.3943],[258,272,3.1043],[259,260,0.17],[259,261,0.36],[259,270,2.52],[259,307,12.17],[260,261,0.19],[260,282,6.0],[260,307,12.0],[261,262,0.01],[261,263,0.18],[261,264,0.3],[262,263,0.17],[262,268,1.79],[263,264,0.12],[263,315,12.785],[264,265,0.418],[265,266,0.032],[265,273,1.81],[265,275,3.6],[265,277,3.6],[265,365,25.2],[266,267,0.2493],[266,268,1.05],[266,298,10.36],[267,268,0.8007],[268,269,0.208],[268,274,1.81],[268,279,3.6],[269,270,0.152],[270,271,0.06],[270,281,3.63],[271,272,0.13],[271,284,4.83],[272,273,0.178],[273,274,1.082],[273,275,1.79],[274,275,0.708],[274,278,1.5],[274,279,1.79],[274,285,3.6],[275,276,0.302],[275,283,1.81],[275,291,3.6],[276,277,0.1],[277,278,0.39],[278,279,0.29],[279,280,0.29],[279,281,0.39],[279,285,1.81],[279,292,3.6],[280,281,0.1],[281,282,0.02],[281,283,0.338],[281,292,3.21],[281,294,3.93],[282,283,0.318],[282,307,6.0],[283,284,0.922],[283,291,1.79],[283,295,3.6],[284,285,0.16],[284,288,0.69],[285,286,0.19],[285,292,1.79],[285,296,3.6],[286,287,0.186],[287,288,0.154],[288,289,0.07],[289,290,0.01],[290,291,0.098],[290,326,10.0],[291,292,1.082],[291,295,1.81],[291,301,3.6],[292,293,0.313],[292,294,0.72],[292,296,1.81],[292,314,3.6],[293,294,0.407],[294,295,0.008],[294,312,2.52],[295,296,1.082],[295,301,1.79],[295,316,3.6],[296,297,0.2],[296,311,1.4],[296,314,1.79],[296,324,3.6],[297,298,0.1],[297,299,0.2],[298,299,0.1],[298,307,0.7],[299,300,0.2],[300,301,0.108],[300,302,0.2],[301,302,0.092],[301,316,1.81],[301,321,3.6],[302,303,0.06],[302,304,0.08],[302,307,0.2],[303,304,0.02],[303,307,0.14],[304,305,0.0069],[304,306,0.039],[304,309,0.157],[304,317,2.52],[305,306,0.0321],[305,317,2.5131],[305,369,15.877],[306,307,0.081],[306,356,12.783],[306,369,15.8449],[307,308,0.002],[307,309,0.037],[307,310,0.2],[307,320,3.0],[308,309,0.035],[309,310,0.163],[309,313,0.45],[310,311,0.2],[311,312,0.03],[312,313,0.057],[312,319,2.52],[312,334,7.56],[313,314,0.303],[314,315,0.365],[315,316,0.363],[316,317,0.882],[316,318,1.082],[316,321,1.79],[316,324,3.6],[317,318,0.2],[318,319,0.35],[319,320,0.05],[319,325,2.52],[320,321,0.308],[321,322,0.562],[321,324,1.81],[321,330,3.6],[322,323,0.937],[322,351,8.4],[322,352,8.4233],[322,353,8.435],[323,324,0.311],[323,327,1.321],[323,328,1.421],[323,329,1.811],[324,325,0.352],[324,329,1.5],[324,330,1.79],[324,336,3.6],[325,326,0.54],[325,334,2.52],[326,327,0.118],[327,328,0.1],[328,329,0.39],[329,330,0.29],[329,332,0.602],[330,331,0.182],[330,332,0.312],[330,336,1.81],[330,339,2.186],[330,347,3.6],[331,332,0.13],[332,333,0.5],[333,334,0.27],[333,335,0.55],[334,335,0.28],[334,348,2.52],[335,336,0.448],[335,339,0.824],[336,337,0.262],[336,338,0.357],[336,340,0.437],[336,341,0.482],[336,343,0.972],[336,344,1.112],[336,346,1.672],[336,347,1.79],[336,354,3.6],[337,338,0.095],[338,339,0.019],[339,340,0.061],[339,342,0.496],[339,347,1.414],[340,341,0.045],[341,342,0.39],[342,343,0.1],[342,345,0.3],[343,344,0.14],[344,345,0.06],[345,346,0.5],[345,347,0.618],[346,347,0.118],[347,348,0.002],[347,349,0.5],[347,354,1.81],[347,365,3.6],[348,349,0.498],[348,359,2.52],[349,350,1.102],[350,351,0.16],[350,369,3.6539],[351,352,0.0233],[352,353,0.0117],[353,354,0.013],[354,355,0.2],[354,363,1.4],[354,365,1.79],[354,369,3.4459],[355,356,0.184],[355,357,0.2],[356,357,0.016],[357,358,0.2],[358,359,0.112],[358,360,0.2],[359,360,0.088],[359,368,2.44],[360,361,0.2],[361,362,0.2],[362,363,0.2],[363,364,0.2198],[364,365,0.1702],[365,366,1.222],[366,367,0.06],[367,368,0.08],[368,369,0.2939],[368,371,2.98],[369,370,2.1061],[369,381,27.3061],[370,371,0.58],[370,381,25.2],[371,372,2.14],[372,373,2.52],[373,374,2.52],[374,375,2.52],[375,376,2.52],[376,377,2.52],[377,378,2.52],[378,379,2.52],[379,380,2.52],[380,381,2.32],[380,382,2.52],[381,382,0.2],[382,383,2.52],[383,384,1.8],[383,385,2.52],[384,385,0.72],[384,388,3.6],[385,386,0.323],[385,387,2.52],[386,387,2.197],[386,389,3.652],[387,388,0.36],[387,390,2.52],[388,389,1.095],[389,390,1.065],[390,391,2.52],[391,392,2.52],[392,393,2.88],[392,394,5.04],[392,395,14.4],[393,394,2.16],[394,395,9.36],[395,396,14.4],[396,397,72.0],[397,398,28.8]];

// ═══════════════════════════════════════════════════════════
// GRAPH ENGINE — adjacency, classification, d-separation
// ═══════════════════════════════════════════════════════════
const N = NODE_YS.length;
const CHILDREN = Array.from({length:N},()=>[]);
const PARENTS = Array.from({length:N},()=>[]);
for (const [fi,ti,w] of EDGES_RAW) { CHILDREN[fi].push([ti,w]); PARENTS[ti].push([fi,w]); }

const NODE_CLASS = new Array(N);
for (let i=0;i<N;i++){
  const ind=PARENTS[i].length, outd=CHILDREN[i].length;
  if(ind>=2&&outd>=2) NODE_CLASS[i]="collider_fork";
  else if(ind>=2&&outd>=1) NODE_CLASS[i]="collider";
  else if(ind>=2) NODE_CLASS[i]="collider_sink";
  else if(outd>=2) NODE_CLASS[i]="fork";
  else if(ind===1&&outd===1) NODE_CLASS[i]="chain";
  else if(ind===0) NODE_CLASS[i]="source";
  else NODE_CLASS[i]="sink";
}

function findNearestIdx(y){
  let best=0,bestD=Infinity;
  for(let i=0;i<N;i++){const d=Math.abs(NODE_YS[i]-y);if(d<bestD){bestD=d;best=i;}}
  return best;
}
const EPSILON=0.15;

function dSeparationCascade(touchedIdx,conditionedSet){
  const visited=new Set(),open=new Set(),blocked=new Set(),paths=[];
  const queue=[];
  for(const[ci]of CHILDREN[touchedIdx]) queue.push([ci,"down",[touchedIdx,ci]]);
  for(const[pi]of PARENTS[touchedIdx]) queue.push([pi,"up",[touchedIdx,pi]]);
  for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}
  while(queue.length){
    const[idx,dir,path]=queue.shift();
    const sk=\`\${idx}:\${dir}\`;
    if(visited.has(sk))continue;visited.add(sk);
    const isCond=conditionedSet.has(idx);
    const isCollider=NODE_CLASS[idx].startsWith("collider");
    if(isCollider){
      if(isCond){open.add(idx);paths.push({path:[...path],type:"collider_open"});
        for(const[pi]of PARENTS[idx])if(!visited.has(\`\${pi}:up\`))queue.push([pi,"up",[...path,pi]]);
        for(const[ci]of CHILDREN[idx])if(!visited.has(\`\${ci}:down\`))queue.push([ci,"down",[...path,ci]]);
      } else blocked.add(idx);
    } else {
      if(!isCond){open.add(idx);paths.push({path:[...path],type:dir==="down"?"chain_open":"fork_open"});
        if(dir==="down")for(const[ci]of CHILDREN[idx])if(!visited.has(\`\${ci}:down\`))queue.push([ci,"down",[...path,ci]]);
        else for(const[pi]of PARENTS[idx])if(!visited.has(\`\${pi}:up\`))queue.push([pi,"up",[...path,pi]]);
        if(NODE_CLASS[idx]==="fork"||NODE_CLASS[idx]==="collider_fork")
          for(const[ci]of CHILDREN[idx])if(!visited.has(\`\${ci}:down\`))queue.push([ci,"down",[...path,ci]]);
      } else blocked.add(idx);
    }
  }
  return {open,blocked,paths};
}

// ═══════════════════════════════════════════════════════════
// OBSERVATION LAYER — Hodges & Dewar (1992) validation
// Five states: keep-in-view | confirmed | rejected | refined | reverse-and-rebuild
// ═══════════════════════════════════════════════════════════
const OBS_STATES=["keep-in-view","confirmed","rejected","refined","reverse-and-rebuild"];
const OBS_COLORS={"keep-in-view":"#c8b478","confirmed":"#50b478","rejected":"#e06040","refined":"#8080c0","reverse-and-rebuild":"#c04080"};
const LOCKIN_DECAY=0.6;

function emptyStore(sfoLabel,A,C){
  return {sfo:sfoLabel,A,C,observations:[],lockins:[],projections:[]};
}

function mkObs(nodeY,prompt,digest,state,keywords,liveY,travelY){
  return {id:\`obs_\${Date.now()}_\${Math.random().toString(36).slice(2,7)}\`,nodeY,prompt,digest,state,keywords:keywords||[],
    timestamp:new Date().toISOString(),liveY,travelY};
}

function mkLockin(nodeY,keyword,obsId){
  return {id:\`lk_\${Date.now()}_\${Math.random().toString(36).slice(2,7)}\`,nodeY,keyword,observation_id:obsId,
    locked_at:new Date().toISOString(),state:"active",reversal_id:null,reversal_reason:null};
}

function mkProjection(sourceY,targetY,edgeWeight,digest,prompt,A){
  const daysToTarget=Math.abs(targetY-sourceY)*A;
  const expected=new Date(Date.now()+daysToTarget*MSD);
  return {id:\`proj_\${Date.now()}_\${Math.random().toString(36).slice(2,7)}\`,sourceY,targetY,edgeWeight,digest,prompt,
    projected_at:new Date().toISOString(),expected_arrival:expected.toISOString(),
    resolution_state:null,resolution_observation_id:null,resolved_at:null};
}

function nodeObs(store,y){ return store.observations.filter(o=>Math.abs(o.nodeY-y)<0.001); }
function nodeLockins(store,y){ return store.lockins.filter(l=>Math.abs(l.nodeY-y)<0.001&&l.state==="active"); }
function neighborLockins(store,nodeIdx){
  const result=[];
  for(const[pi]of PARENTS[nodeIdx]){
    const lks=store.lockins.filter(l=>Math.abs(l.nodeY-NODE_YS[pi])<0.001&&l.state==="active");
    for(const lk of lks) result.push({...lk,weight:LOCKIN_DECAY,fromIdx:pi});
  }
  for(const[ci]of CHILDREN[nodeIdx]){
    const lks=store.lockins.filter(l=>Math.abs(l.nodeY-NODE_YS[ci])<0.001&&l.state==="active");
    for(const lk of lks) result.push({...lk,weight:LOCKIN_DECAY*0.8,fromIdx:ci});
  }
  return result;
}
function pendingProjections(store,y){ return store.projections.filter(p=>!p.resolution_state&&Math.abs(p.targetY-y)<0.5); }

// ── RSS Feed System (matching vite.config.js) ──
const NEWS_FEEDS=[
  {id:"cnn",label:"CNN",proxy:"/rss/cnn",perspective:"Western"},
  {id:"jpost",label:"Jerusalem Post",proxy:"/rss/jpost",perspective:"Middle East (Israeli)"},
  {id:"aljazeera",label:"Al Jazeera",proxy:"/rss/aljazeera",perspective:"Middle East (Arab)"},
  {id:"reuters",label:"Reuters",proxy:"/rss/reuters",perspective:"Wire service"},
  {id:"tass",label:"TASS",proxy:"/rss/tass",perspective:"Russian"},
  {id:"arise",label:"AriseNews",proxy:"/rss/arise",perspective:"African"},
  {id:"symfoni",label:"Symfoni",proxy:"/rss/symfoni",perspective:"Nigerian"},
  {id:"bbc",label:"BBC",proxy:"/rss/bbc",perspective:"British"},
  {id:"foxnews",label:"Fox News",proxy:"/rss/foxnews",perspective:"American conservative"},
  {id:"newsmax",label:"Newsmax",proxy:"/rss/newsmax",perspective:"American conservative"},
  {id:"firstpost",label:"Vantage/FirstPost",proxy:"/rss/firstpost",perspective:"Indian"},
];

function parseRSSXml(xml,src){
  try{const doc=new DOMParser().parseFromString(xml,"text/xml");
    const items=[],nodes=doc.querySelectorAll("item").length?doc.querySelectorAll("item"):doc.querySelectorAll("entry");
    for(let i=0;i<Math.min(nodes.length,10);i++){const el=nodes[i];
      const title=el.querySelector("title")?.textContent?.trim()||"";
      const link=el.querySelector("link")?.textContent?.trim()||el.querySelector("link")?.getAttribute("href")||"";
      const desc=(el.querySelector("description")?.textContent||el.querySelector("summary")?.textContent||"").trim().replace(/<[^>]*>/g,"").slice(0,200);
      const pubDate=el.querySelector("pubDate")?.textContent?.trim()||el.querySelector("published")?.textContent?.trim()||"";
      if(title) items.push({title,link,description:desc,pubDate,source:src});
    }return items;
  }catch{return [];}
}

async function fetchFeed(feed){
  try{const r=await fetch(feed.proxy,{signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error(\`HTTP \${r.status}\`);
    return {source:feed.label,items:parseRSSXml(await r.text(),feed.label),error:null};
  }catch(e){return {source:feed.label,items:[],error:e.message};}
}

// ── Digest Engine ──
async function requestDigest(ctx){
  try{const r=await fetch("/api/digest",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(ctx),signal:AbortSignal.timeout(30000)});
    if(!r.ok)return {digest:null,error:\`HTTP \${r.status}\`};
    const d=await r.json();return {digest:d.content?.map(c=>c.text||"").join("\\n")||"",error:null};
  }catch(e){return {digest:null,error:e.message};}
}

// ═══════════════════════════════════════════════════════════
// STYLES — derived from ThemeContext; dark themes keep the
// original dark palette, light themes map to their equivalents.
// Call useStyles() inside the component (it uses useTheme()).
// ═══════════════════════════════════════════════════════════
function useStyles(){
  const t=useTheme();
  if(t.isDark) return {
    bg:"#060610",inputBg:"#0c0c14",
    fg:"#d0c4a0",dim:"rgba(200,180,140,0.4)",dim2:"rgba(200,180,140,0.25)",
    acc:"#f0c040",pink:"#FF1493",pinkGlow:"#FF69B4",travel:"#c080ff",
    green:"rgba(80,180,120,0.7)",openG:"rgba(80,255,140,0.7)",blockR:"rgba(255,60,60,0.5)",
    condG:"#FFD740",border:"rgba(200,180,140,0.1)",panelBg:"rgba(200,180,140,0.03)",
    fgMuted:"#555",btnDisabledBg:"rgba(255,255,255,0.03)",btnDisabledBorder:"rgba(255,255,255,0.08)",
  };
  return {
    bg:t.bg.card,inputBg:t.bg.input,
    fg:t.text.primary,dim:t.text.secondary,dim2:t.text.muted,
    acc:t.accent.gold,pink:t.accent.pink,pinkGlow:t.accent.pink,travel:t.accent.purple,
    green:t.accent.green,openG:t.accent.green,blockR:t.accent.red,
    condG:t.accent.gold,border:t.border.card,panelBg:t.bg.cardAlt,
    fgMuted:t.text.muted,btnDisabledBg:t.bg.cardAlt,btnDisabledBorder:t.border.subtle,
  };
}

// ═══════════════════════════════════════════════════════════
// SFO FORGE — Solver algebra + anchor presets
// Z = A*Y + C
// Two anchors: exact solve.  Three+: least-squares regression.
// ═══════════════════════════════════════════════════════════
const ANCHOR_PRESETS=[
  {y:0.0,label:"BB=0 (Origin/ZTP)",hint:"C equals the TNLDY at this node."},
  {y:-18.0,label:"BB=-18 (Hub d9)",hint:"Major hub degree 9 in deep structure."},
  {y:-147.6,label:"BB=-147.6 (Source)",hint:"Single source node of the DAG."},
  {y:10.8,label:"BB=10.8 (Hub d8)",hint:"Hub connected to origin w=10.8."},
  {y:21.6,label:"BB=21.6 (Hub d8)",hint:"Hub node degree 8."},
  {y:33.128,label:"BB=33.128 (Mega-hub d12)",hint:"Highest degree non-origin node."},
  {y:82.8,label:"BB=82.8",hint:"Deep future structure."},
  {y:212.4,label:"BB=212.4 (Sink)",hint:"Single sink node of the DAG."},
];
const PREVIEW_YS=[-147.6,-104.4,-60.97,-43.2,-18.0,0.0,3.6,10.8,18.0,21.6,25.2,33.128,38.3478,72.0,82.8,111.6,212.4];

function dateStrToTnldy(s){const ms=new Date(s+"T00:00:00Z").getTime();return isNaN(ms)?null:(EPOCH+ms)/MSD;}

// Exact solve from 2 anchors
function solveExact(y1,z1,y2,z2){
  if(Math.abs(y2-y1)<1e-6) return null;
  const A=(z2-z1)/(y2-y1);
  const C=z1-A*y1;
  return A>0?{A,C,residual:0,method:"exact"}:null;
}

// Least-squares for n>=2 anchors: minimise sum (Z_i - A*Y_i - C)^2
// Normal equations: [sum(Yi^2) sum(Yi)] [A]   [sum(Yi*Zi)]
//                   [sum(Yi)   n      ] [C] = [sum(Zi)   ]
function solveLeastSquares(anchors){
  const n=anchors.length;
  if(n<2) return null;
  let sy=0,sz=0,syy=0,syz=0;
  for(const{y,z}of anchors){sy+=y;sz+=z;syy+=y*y;syz+=y*z;}
  const det=syy*n-sy*sy;
  if(Math.abs(det)<1e-12) return null;
  const A=(syz*n-sy*sz)/det;
  const C=(syy*sz-sy*syz)/det;
  if(A<=0) return null;
  let ssr=0;
  for(const{y,z}of anchors){const r=z-(A*y+C);ssr+=r*r;}
  const rmse=Math.sqrt(ssr/n);
  return {A,C,residual:rmse,method:n===2?"exact":"least-squares (n="+n+")"};
}

function forgeTimeline(A,C){
  const zNow=tnldyNow();
  return PREVIEW_YS.map(y=>{
    const z=A*y+C;const d=tnldyToDate(z);const df=z-zNow;
    return {y,z,date:fd(d),daysFromNow:Math.round(df),isPast:z<zNow};
  });
}

function forgeTimelineAll(A,C){
  const zNow=tnldyNow();
  return NODE_YS.map(y=>{
    const z=A*y+C;const d=tnldyToDate(z);const df=z-zNow;
    return {y,z,date:fd(d),daysFromNow:Math.round(df),isPast:z<zNow};
  });
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function SFOWAMEngine({
  agentA = 100,      // Traversal coefficient
  agentC = 17651.8,  // Zero-traversal point
  sfoLabel = "SFO26", // Display label
  onForge = null,    // Callback to persist forged SFO to registry
}){
  const S = useStyles();  // theme-derived colour palette

  // ── Time ──
  const [now,setNow]=useState(Date.now());
  const [travelY,setTravelY]=useState(null);
  const [yInput,setYInput]=useState("");
  const [zInput,setZInput]=useState("");

  // ── Graph state ──
  const [selectedIdx,setSelectedIdx]=useState(null);
  const [conditioned,setConditioned]=useState(new Set());
  const [dsepResult,setDsepResult]=useState(null);
  const [activations,setActivations]=useState({});
  const [tab,setTab]=useState("observe");

  // ── Observation pipeline state ──
  const [obsStore,setObsStore]=useState(()=>emptyStore(sfoLabel,agentA,agentC));
  const [digestPrompt,setDigestPrompt]=useState("");
  const [digestResult,setDigestResult]=useState(null);
  const [digestLoading,setDigestLoading]=useState(false);
  const [mockDigest,setMockDigest]=useState("");
  const [obsKeywords,setObsKeywords]=useState("");

  // ── Feed state ──
  const [feedResults,setFeedResults]=useState({});
  const [feedLoading,setFeedLoading]=useState(false);
  const [feedLastFetch,setFeedLastFetch]=useState(0);

  // ── SFO FORGE state ──
  const [forgeAnchors,setForgeAnchors]=useState([{y:"0",date:""},{y:"-18",date:""}]);
  const [forgeMode,setForgeMode]=useState("anchors"); // "anchors" | "one_plus_A"
  const [forgeDirectA,setForgeDirectA]=useState("");
  const [forgeName,setForgeName]=useState("");
  const [forgedSFOs,setForgedSFOs]=useState([]); // registry of created SFOs
  const [sfoStores,setSfoStores]=useState({}); // per-SFO observation stores keyed by id
  const [overrideA,setOverrideA]=useState(null); // null = use props
  const [overrideC,setOverrideC]=useState(null);
  const [overrideLabel,setOverrideLabel]=useState(null);
  const [showFull399,setShowFull399]=useState(false);
  const [forgeToast,setForgeToast]=useState(null); // name of last-created SFO, auto-clears

  // ── CSV download for full 399-node timeline ──
  const downloadCSV=useCallback((rows,filename)=>{
    const hdr="BB_Y,TNLDY_Z,Calendar_Date,Days_From_Now,Past_Or_Future\\n";
    const body=rows.map(r=>r.y+","+r.z.toFixed(6)+","+r.date+","+r.daysFromNow+","+(r.isPast?"past":"future")).join("\\n");
    const blob=new Blob([hdr+body],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
  },[]);

  // ── Active agent params (forge override or props) ──
  const curA=overrideA!==null?overrideA:agentA;
  const curC=overrideC!==null?overrideC:agentC;
  const curLabel=overrideLabel||sfoLabel;

  // ── Switch active SFO ──
  const switchToSFO=useCallback((sfo)=>{
    // Save current obsStore to sfoStores
    const curId=overrideLabel||sfoLabel;
    setSfoStores(prev=>({...prev,[curId]:obsStore}));
    // Load target store or create fresh
    const targetStore=sfoStores[sfo.name]||emptyStore(sfo.name,sfo.A,sfo.C);
    setObsStore(targetStore);
    setOverrideA(sfo.A);setOverrideC(sfo.C);setOverrideLabel(sfo.name);
    setTravelY(null);setTab("observe");
  },[obsStore,sfoStores,overrideLabel,sfoLabel]);

  const switchToProps=useCallback(()=>{
    const curId=overrideLabel||sfoLabel;
    setSfoStores(prev=>({...prev,[curId]:obsStore}));
    const propsStore=sfoStores[sfoLabel]||emptyStore(sfoLabel,agentA,agentC);
    setObsStore(propsStore);
    setOverrideA(null);setOverrideC(null);setOverrideLabel(null);
    setTravelY(null);
  },[obsStore,sfoStores,overrideLabel,sfoLabel,agentA,agentC]);

  // ── Forge solver (memoised) ──
  const forgeSolution=useMemo(()=>{
    if(forgeMode==="one_plus_A"){
      const a=parseFloat(forgeDirectA);
      const y1=parseFloat(forgeAnchors[0]?.y);
      const z1=forgeAnchors[0]?.date?dateStrToTnldy(forgeAnchors[0].date):null;
      if(isNaN(a)||a<=0||isNaN(y1)||!z1) return null;
      const C=z1-a*y1;
      return {A:Math.round(a*10000)/10000,C:Math.round(C*10000)/10000,residual:0,method:"one anchor + known A"};
    }
    // Parse all anchors with both fields filled
    const valid=forgeAnchors.filter(a=>a.date&&!isNaN(parseFloat(a.y)))
      .map(a=>({y:parseFloat(a.y),z:dateStrToTnldy(a.date)}))
      .filter(a=>a.z!==null);
    if(valid.length<2) return null;
    if(valid.length===2) return solveExact(valid[0].y,valid[0].z,valid[1].y,valid[1].z);
    return solveLeastSquares(valid);
  },[forgeAnchors,forgeMode,forgeDirectA]);

  // ── Forge preview ──
  const forgePreview=useMemo(()=>{
    if(!forgeSolution) return null;
    const {A,C}=forgeSolution;
    const zNow=tnldyNow();
    const yNow=(zNow-C)/A;
    const bbIdx=findNearestIdx(yNow);
    const zFirst=A*NODE_YS[0]+C;const zLast=A*NODE_YS[N-1]+C;
    return {
      yNow:Math.round(yNow*10000)/10000,bbIdx,bbNodeY:NODE_YS[bbIdx],
      timeline:forgeTimeline(A,C),
      full399:forgeTimelineAll(A,C),
      spanDays:Math.round(zLast-zFirst),
      spanYears:Math.round((zLast-zFirst)/365.2422*100)/100,
      dateFirst:fd(tnldyToDate(zFirst)),dateLast:fd(tnldyToDate(zLast))
    };
  },[forgeSolution]);

  // ── Create forged SFO ──
  const createForgedSFO=useCallback(()=>{
    if(!forgeSolution||!forgeName.trim()) return;
    const full399=forgeTimelineAll(forgeSolution.A,forgeSolution.C);
    const sfo={
      id:"sfo_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
      name:forgeName.trim(),A:forgeSolution.A,C:forgeSolution.C,
      method:forgeSolution.method,residual:forgeSolution.residual,
      created:new Date().toISOString(),
      anchors:forgeAnchors.filter(a=>a.date&&a.y).map(a=>({y:parseFloat(a.y),date:a.date})),
      yNow:forgePreview?.yNow,spanYears:forgePreview?.spanYears,
      timeline399:full399
    };
    const created=sfo.name;
    setForgedSFOs(prev=>[...prev,sfo]);
    setSfoStores(prev=>({...prev,[sfo.name]:emptyStore(sfo.name,sfo.A,sfo.C)}));
    setForgeName("");
    setForgeToast(created);
    setTimeout(()=>setForgeToast(null),3000);
    if(onForge) onForge(sfo);
  },[forgeSolution,forgeName,forgeAnchors,forgePreview,onForge]);

  // ── Canvas ──
  const canvasRef=useRef(null);
  const lastTouchedRef=useRef(null);

  // ── Tick ──
  useEffect(()=>{const iv=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(iv);},[]);

  // ── Computed coordinates (uses active agent: forge override or props) ──
  const Z=tnldy(now);
  const liveY=agentY(Z,curA,curC);
  const viewY=travelY!==null?travelY:liveY;
  const viewZ=agentZ(viewY,curA,curC);
  const viewDate=tnldyToDate(viewZ);
  const isTraveling=travelY!==null;
  const currentIdx=useMemo(()=>findNearestIdx(viewY),[viewY]);
  const isAtNode=Math.abs(NODE_YS[currentIdx]-viewY)<EPSILON;

  // ── Auto-touch on time crossing ──
  useEffect(()=>{
    if(isAtNode&&lastTouchedRef.current!==currentIdx){
      lastTouchedRef.current=currentIdx;
      touchNode(currentIdx);
    }
  },[currentIdx,isAtNode]);

  // ── Touch a node: pink activation + d-separation ──
  const touchNode=useCallback((idx)=>{
    const t=Date.now();
    const acts={[idx]:{time:t,type:"primary",int:1}};
    for(const[ci,w]of CHILDREN[idx]) acts[ci]={time:t,type:"child",int:0.85,w};
    for(const[pi,w]of PARENTS[idx]) acts[pi]={time:t,type:"parent",int:0.75,w};
    setActivations(prev=>({...prev,...acts}));
    const dsep=dSeparationCascade(idx,conditioned);
    for(const oi of dsep.open) if(!(oi in acts)) acts[oi]={time:t,type:"dsep_open",int:0.5};
    setDsepResult({...dsep,touchedIdx:idx,time:t});
    setActivations(prev=>({...prev,...acts}));
    const maxW=Math.max(...[...CHILDREN[idx],...PARENTS[idx]].map(([,w])=>w),1);
    const dur=Math.min(Math.max(maxW*2000,3000),15000);
    setTimeout(()=>{setActivations(prev=>{
      const next={...prev};for(const k of Object.keys(acts))if(next[k]?.time===t)delete next[k];return next;
    });},dur);
  },[conditioned]);

  const toggleCondition=useCallback(idx=>{
    setConditioned(prev=>{const n=new Set(prev);if(n.has(idx))n.delete(idx);else n.add(idx);return n;});
  },[]);

  // ── Time travel ──
  const goToY=useCallback(()=>{const v=parseFloat(yInput);if(!isNaN(v)){setTravelY(v);setZInput(agentZ(v,curA,curC).toFixed(6));}},[yInput,curA,curC]);
  const goToZ=useCallback(()=>{const z=parseFloat(zInput);if(!isNaN(z)){const y=agentY(z,curA,curC);setTravelY(y);setYInput(y.toFixed(6));}},[zInput,curA,curC]);
  const returnToNow=()=>{setTravelY(null);setYInput("");setZInput("");};

  // ── Outgoing edges from current node ──
  const outEdges=useMemo(()=>CHILDREN[currentIdx].map(([ti,w])=>({to:ti,toY:NODE_YS[ti],weight:w})),[currentIdx]);
  const inEdges=useMemo(()=>PARENTS[currentIdx].map(([pi,w])=>({from:pi,fromY:NODE_YS[pi],weight:w})),[currentIdx]);

  // ── Observation queries ──
  const curObs=useMemo(()=>nodeObs(obsStore,viewY),[obsStore,viewY]);
  const curLockins=useMemo(()=>nodeLockins(obsStore,viewY),[obsStore,viewY]);
  const curNeighborLk=useMemo(()=>neighborLockins(obsStore,currentIdx),[obsStore,currentIdx]);
  const curPending=useMemo(()=>pendingProjections(obsStore,viewY),[obsStore,viewY]);

  // ── OPERATION 1: OBSERVE — Record observation with five-state judgement ──
  const recordObservation=useCallback((state)=>{
    const digest=digestResult?.digest||mockDigest.trim()||"(no digest)";
    const kws=obsKeywords.split(",").map(k=>k.trim()).filter(Boolean);
    const obs=mkObs(viewY,digestPrompt,digest,state,kws,liveY,travelY);
    const newStore={...obsStore,observations:[...obsStore.observations,obs]};
    // OPERATION 2: PROPAGATE — lock-in on confirm
    if(state==="confirmed"&&kws.length>0){
      newStore.lockins=[...newStore.lockins,...kws.map(kw=>mkLockin(viewY,kw,obs.id))];
    }
    // reverse-and-rebuild: revoke active lock-ins at this node
    if(state==="reverse-and-rebuild"){
      newStore.lockins=newStore.lockins.map(lk=>
        Math.abs(lk.nodeY-viewY)<0.001&&lk.state==="active"
          ?{...lk,state:"reversed",reversal_id:obs.id,reversal_reason:digest.slice(0,200)}:lk
      );
    }
    setObsStore(newStore);
    setDigestPrompt("");setMockDigest("");setDigestResult(null);setObsKeywords("");
  },[digestResult,mockDigest,digestPrompt,obsKeywords,viewY,liveY,travelY,obsStore]);

  // ── OPERATION 3: PROJECT — Create projection along an outgoing edge ──
  const recordProjection=useCallback((edgeTarget)=>{
    const digest=digestResult?.digest||mockDigest.trim()||"(no digest)";
    const proj=mkProjection(viewY,edgeTarget.toY,edgeTarget.weight,digest,digestPrompt,curA);
    setObsStore(prev=>({...prev,projections:[...prev.projections,proj]}));
  },[digestResult,mockDigest,digestPrompt,viewY,curA]);

  // ── OPERATION 4: JUDGE — Resolve a pending projection ──
  const resolveProjection=useCallback((projId,state,obsId)=>{
    setObsStore(prev=>({...prev,projections:prev.projections.map(p=>
      p.id===projId?{...p,resolution_state:state,resolution_observation_id:obsId||null,resolved_at:new Date().toISOString()}:p
    )}));
  },[]);

  // ── Digest engine ──
  const submitDigest=useCallback(async()=>{
    if(!digestPrompt.trim()&&!mockDigest.trim())return;
    setDigestLoading(true);
    const ctx={sfo:curLabel,A:curA,C:curC,currentY:viewY,currentZ:viewZ,currentDate:viewDate?.toISOString(),
      nodeIdx:currentIdx,nodeY:NODE_YS[currentIdx],nodeClass:NODE_CLASS[currentIdx],
      parents:PARENTS[currentIdx].map(([pi,w])=>({y:NODE_YS[pi],w,class:NODE_CLASS[pi]})),
      children:CHILDREN[currentIdx].map(([ci,w])=>({y:NODE_YS[ci],w,class:NODE_CLASS[ci]})),
      observations:curObs.slice(-10),lockins:curLockins,neighborLockins:curNeighborLk,
      pendingProjections:curPending,humanPrompt:digestPrompt.trim(),
      feedResults:Object.values(feedResults).flat()};
    const result=await requestDigest(ctx);
    if(result.digest) setDigestResult(result);
    else setDigestResult({digest:mockDigest.trim()||\`[API unavailable: \${result.error}. Use mock digest below.]\`,error:result.error});
    setDigestLoading(false);
  },[digestPrompt,mockDigest,curLabel,curA,curC,viewY,viewZ,viewDate,currentIdx,curObs,curLockins,curNeighborLk,curPending,feedResults]);

  // ── Feed fetch ──
  const fetchFeeds=useCallback(async()=>{
    if(Date.now()-feedLastFetch<60000)return;
    setFeedLoading(true);
    const results=await Promise.allSettled(NEWS_FEEDS.map(f=>fetchFeed(f)));
    const items=results.map(r=>r.status==="fulfilled"?r.value:{source:"?",items:[],error:"rejected"});
    setFeedResults({news:items});setFeedLastFetch(Date.now());setFeedLoading(false);
  },[feedLastFetch]);

  // ── Canvas layout & rendering ──
  const CW=1200,CH=500,PAD=35;
  const layout=useMemo(()=>{
    const depth=new Array(N).fill(-1);
    const q=[];
    for(let i=0;i<N;i++)if(!PARENTS[i].length){depth[i]=0;q.push(i);}
    let h=0;
    while(h<q.length){const c=q[h++];for(const[ci]of CHILDREN[c])if(depth[ci]<depth[c]+1){depth[ci]=depth[c]+1;q.push(ci);}}
    const maxD=Math.max(...depth.filter(d=>d>=0),1);
    const pos=new Array(N);
    for(let i=0;i<N;i++){
      const x=PAD+(i/(N-1))*(CW-2*PAD);
      const d=depth[i]>=0?depth[i]:0;
      const yBase=PAD+(d/maxD)*(CH-2*PAD);
      const jitter=((i*7919)%37-18)*1.2;
      pos[i]={x,y:Math.max(PAD,Math.min(CH-PAD,yBase+jitter))};
    }
    return pos;
  },[]);

  useEffect(()=>{
    const cv=canvasRef.current;if(!cv)return;
    const ctx=cv.getContext("2d");
    const dpr=window.devicePixelRatio||1;
    cv.width=CW*dpr;cv.height=CH*dpr;ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,CW,CH);ctx.fillStyle=S.bg;ctx.fillRect(0,0,CW,CH);
    // Edges
    for(const[fi,ti]of EDGES_RAW){
      const f=layout[fi],t=layout[ti];
      const isAct=activations[fi]||activations[ti];
      const isOpen=dsepResult?.open.has(fi)&&dsepResult?.open.has(ti);
      ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(t.x,t.y);
      ctx.strokeStyle=isAct&&isOpen?S.openG:isAct?\`rgba(255,20,147,0.4)\`:S.border;
      ctx.lineWidth=isAct?1.2:0.3;ctx.stroke();
    }
    // Nodes
    for(let i=0;i<N;i++){
      const p=layout[i],act=activations[i],isCond=conditioned.has(i),isCur=i===currentIdx&&isAtNode,isSel=i===selectedIdx;
      let r=1.8;if(act)r=act.type==="primary"?6:4;if(isCur)r=Math.max(r,5);if(isSel)r=Math.max(r,7);
      let col="rgba(255,255,255,0.1)";
      if(act){if(act.type==="primary")col=S.pink;else if(act.type==="parent")col=S.pinkGlow;else if(act.type==="child")col=S.pink;else if(act.type==="dsep_open")col=S.openG;}
      if(dsepResult?.blocked.has(i))col=S.blockR;
      if(isCond)col=S.condG;
      if(isCur&&!act)col="#fff";
      // Glow
      if(act&&(act.type==="primary"||act.type==="child"||act.type==="parent")){
        ctx.beginPath();ctx.arc(p.x,p.y,r+8,0,Math.PI*2);
        const g=ctx.createRadialGradient(p.x,p.y,r,p.x,p.y,r+8);
        g.addColorStop(0,\`rgba(255,20,147,\${act.int*0.4})\`);g.addColorStop(1,"rgba(255,20,147,0)");
        ctx.fillStyle=g;ctx.fill();
      }
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      if(isCond){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI/4);ctx.strokeStyle=S.condG;ctx.lineWidth=1.5;ctx.strokeRect(-r-3,-r-3,(r+3)*2,(r+3)*2);ctx.restore();}
      if(isSel||isCur){ctx.font="9px monospace";ctx.fillStyle="rgba(255,255,255,0.7)";ctx.textAlign="center";ctx.fillText(NODE_YS[i].toFixed(2),p.x,p.y-r-4);}
      // Lock-in indicator
      const hasLk=obsStore.lockins.some(l=>Math.abs(l.nodeY-NODE_YS[i])<0.001&&l.state==="active");
      if(hasLk){ctx.beginPath();ctx.arc(p.x,p.y,r+3,0,Math.PI*2);ctx.strokeStyle="rgba(80,180,120,0.5)";ctx.lineWidth=1;ctx.stroke();}
    }
  },[layout,activations,conditioned,dsepResult,currentIdx,isAtNode,selectedIdx,obsStore]);

  // ── Canvas click ──
  const handleClick=useCallback(e=>{
    const rect=e.target.getBoundingClientRect();
    const x=e.clientX-rect.left,y=e.clientY-rect.top;
    let closest=-1,cd=12;
    for(let i=0;i<N;i++){const d=Math.hypot(layout[i].x-x,layout[i].y-y);if(d<cd){cd=d;closest=i;}}
    if(closest>=0){if(e.shiftKey)toggleCondition(closest);else{setSelectedIdx(closest);touchNode(closest);}}
  },[layout,touchNode,toggleCondition]);

  // ── Calibration register ──
  const calibration=useMemo(()=>{
    const ps=obsStore.projections;
    const resolved=ps.filter(p=>p.resolution_state);
    const confirmed=resolved.filter(p=>p.resolution_state==="confirmed");
    const reversed=resolved.filter(p=>p.resolution_state==="reverse-and-rebuild");
    return {total:ps.length,resolved:resolved.length,confirmed:confirmed.length,reversed:reversed.length,
      open:ps.length-resolved.length,rate:resolved.length?((confirmed.length/resolved.length)*100).toFixed(1)+"%":"—"};
  },[obsStore]);

  return(
  <div style={{background:S.bg,color:S.fg,fontFamily:"'JetBrains Mono',monospace",fontSize:11,padding:12,minHeight:"100vh"}}>

    {/* HEADER */}
    <div style={{borderBottom:\`1px solid rgba(255,20,147,0.2)\`,paddingBottom:8,marginBottom:10,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
      <div>
        <span style={{fontSize:15,fontWeight:700,color:S.pink,letterSpacing:"0.05em"}}>◆ SFO-WAM ENGINE</span>
        <span style={{color:"#555",fontSize:9,marginLeft:10}}>{curLabel} · A={curA} · C={curC} · 399n/701e</span>
      </div>
      <div style={{fontSize:9,color:"#666",display:"flex",gap:12}}>
        <span>Obs: <b style={{color:OBS_COLORS.confirmed}}>{obsStore.observations.length}</b></span>
        <span>Lock-ins: <b style={{color:S.green}}>{obsStore.lockins.filter(l=>l.state==="active").length}</b></span>
        <span>Projections: <b style={{color:S.travel}}>{calibration.open} open</b></span>
        <span>Calibration: <b style={{color:S.acc}}>{calibration.rate}</b></span>
        <span>Conditioned: <b style={{color:S.condG}}>{conditioned.size}</b></span>
        {forgedSFOs.length>0&&<span>Forged: <b style={{color:S.pink}}>{forgedSFOs.length}</b></span>}
        {overrideA!==null&&<span style={{color:S.pink,fontWeight:700}}>FORGED: {curLabel}</span>}
      </div>
    </div>

    {/* LIVE METRICS */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8,marginBottom:10}}>
      <div style={{background:S.panelBg,border:\`1px solid \${S.border}\`,padding:"6px 10px"}}>
        <div style={{color:"#555",fontSize:9}}>Y (Live)</div>
        <div style={{color:S.acc,fontWeight:700}}>{liveY.toFixed(6)}</div>
        <div style={{color:"#555",fontSize:9}}>TNLDY: {Z.toFixed(4)}</div>
      </div>
      <div style={{background:isTraveling?"rgba(192,128,255,0.06)":S.panelBg,border:\`1px solid \${isTraveling?"rgba(192,128,255,0.2)":S.border}\`,padding:"6px 10px"}}>
        <div style={{color:"#555",fontSize:9}}>{isTraveling?"View Y (TIME-TRAVEL)":"View Y"}</div>
        <div style={{color:isTraveling?S.travel:S.acc,fontWeight:700}}>{viewY.toFixed(6)}</div>
        <div style={{color:"#555",fontSize:9}}>Node: {NODE_YS[currentIdx]} · {NODE_CLASS[currentIdx]}</div>
      </div>
      <div style={{background:S.panelBg,border:\`1px solid \${S.border}\`,padding:"6px 10px"}}>
        <div style={{color:"#555",fontSize:9}}>Calendar</div>
        <div style={{color:"#b8a878"}}>{fd(viewDate)}</div>
        <div style={{color:"#555",fontSize:9}}>{ft(viewDate)}</div>
      </div>
      <div style={{background:S.panelBg,border:\`1px solid \${S.border}\`,padding:"6px 10px"}}>
        <div style={{color:"#555",fontSize:9}}>Equation</div>
        <div style={{color:"#b8a878",fontSize:10}}>Z = {curA}·Y + {curC}</div>
        <div style={{color:"#555",fontSize:9}}>Rate: 1 Y / {curA} days</div>
      </div>
    </div>

    {/* TIME TRAVEL */}
    <div style={{background:isTraveling?"rgba(192,128,255,0.06)":S.panelBg,border:\`1px solid \${isTraveling?"rgba(192,128,255,0.2)":S.border}\`,padding:"10px 12px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}}>
        <span style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:isTraveling?S.travel:"#555"}}>⟳ Time Travel</span>
        <input type="range" min="-150" max="215" step="0.01" value={travelY!==null?travelY:liveY}
          onChange={e=>{const v=parseFloat(e.target.value);setTravelY(v);setYInput(v.toFixed(4));setZInput(agentZ(v,curA,curC).toFixed(4));}}
          style={{flex:1,minWidth:120,accentColor:isTraveling?S.travel:S.acc,cursor:"pointer"}}/>
        {isTraveling&&<button onClick={returnToNow} style={{background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.25)",color:S.acc,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:10}}>RETURN TO NOW</button>}
      </div>
      {/* Precision entry */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:9,color:"#555",minWidth:20}}>Y:</span>
          <input value={yInput} onChange={e=>setYInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&goToY()}
            placeholder={\`e.g. \${liveY.toFixed(2)}\`}
            style={{flex:1,background:"#0c0c14",border:\`1px solid \${S.border}\`,color:S.fg,fontFamily:"inherit",fontSize:11,padding:"4px 8px"}}/>
          <button onClick={goToY} style={{background:"rgba(192,128,255,0.1)",border:"1px solid rgba(192,128,255,0.2)",color:S.travel,padding:"3px 10px",cursor:"pointer",fontSize:10}}>GO</button>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:9,color:"#555",minWidth:40}}>TNLDY:</span>
          <input value={zInput} onChange={e=>setZInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&goToZ()}
            placeholder={\`e.g. \${viewZ.toFixed(2)}\`}
            style={{flex:1,background:"#0c0c14",border:\`1px solid \${S.border}\`,color:S.fg,fontFamily:"inherit",fontSize:11,padding:"4px 8px"}}/>
          <button onClick={goToZ} style={{background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.2)",color:S.acc,padding:"3px 10px",cursor:"pointer",fontSize:10}}>GO</button>
        </div>
      </div>
    </div>

    {/* CANVAS */}
    <canvas ref={canvasRef} width={CW} height={CH} onClick={handleClick}
      style={{width:"100%",height:CH,cursor:"crosshair",border:\`1px solid \${activations[currentIdx]?"rgba(255,20,147,0.3)":"rgba(255,255,255,0.05)"}\`,display:"block",marginBottom:10}}/>
    <div style={{fontSize:9,color:"#555",marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
      <span><span style={{color:S.pink}}>●</span> Touched</span>
      <span><span style={{color:S.pinkGlow}}>●</span> Parent</span>
      <span><span style={{color:S.openG}}>●</span> d-sep open</span>
      <span><span style={{color:S.blockR}}>●</span> d-sep blocked</span>
      <span><span style={{color:S.condG}}>◇</span> Conditioned</span>
      <span><span style={{color:"rgba(80,180,120,0.5)"}}>○</span> Lock-in active</span>
      <span>Click = touch · Shift+Click = condition</span>
      {conditioned.size>0&&<button onClick={()=>{setConditioned(new Set());setDsepResult(null);}} style={{background:"rgba(255,215,64,0.1)",border:"1px solid rgba(255,215,64,0.3)",color:S.condG,padding:"1px 8px",cursor:"pointer",fontSize:9}}>CLEAR</button>}
    </div>

    {/* TABS */}
    <div style={{display:"flex",gap:2,marginBottom:10}}>
      {["observe","edges","projections","feeds","calibration","history","forge"].map(t=>(
        <button key={t} onClick={()=>setTab(t)} style={{
          background:tab===t?"rgba(255,20,147,0.1)":"transparent",
          border:\`1px solid \${tab===t?"rgba(255,20,147,0.2)":S.border}\`,
          color:tab===t?S.pink:"#555",padding:"4px 14px",cursor:"pointer",
          fontFamily:"inherit",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em"
        }}>{t}</button>
      ))}
    </div>

    {/* ══════════════ TAB: OBSERVE — Digest + Five-State Judgment ══════════════ */}
    {tab==="observe"&&(
    <div style={{border:\`1px solid \${S.border}\`,marginBottom:10}}>
      {/* Node context */}
      <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:4}}>
          Position · Y={viewY.toFixed(4)} · Node {currentIdx} ({NODE_CLASS[currentIdx]}) · in:{PARENTS[currentIdx].length} out:{CHILDREN[currentIdx].length}
          {isAtNode?" · AT NODE":" · IN TRANSIT"}
        </div>
        <div style={{display:"flex",gap:8,fontSize:10,flexWrap:"wrap"}}>
          {curLockins.length>0&&<span style={{color:OBS_COLORS.confirmed}}>■ {curLockins.length} lock-in(s) active at this node</span>}
          {curNeighborLk.length>0&&<span style={{color:S.acc}}>□ {curNeighborLk.length} neighbor lock-in(s) (decay {LOCKIN_DECAY})</span>}
          {curPending.length>0&&<span style={{color:S.travel}}>⊕ {curPending.length} pending projection(s) targeting near here</span>}
        </div>
      </div>

      {/* Digest prompt */}
      <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Digest Engine · {isTraveling?"TIME-TRAVEL":"LIVE"}</div>
        <textarea value={digestPrompt} onChange={e=>setDigestPrompt(e.target.value)}
          placeholder="Enter your prompt — the sharpness of this question determines the quality of the digest..."
          style={{width:"100%",minHeight:60,background:"#0c0c14",border:\`1px solid \${S.border}\`,color:"#b8a878",padding:8,fontSize:11,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
          <button onClick={submitDigest} disabled={digestLoading||(!digestPrompt.trim()&&!mockDigest.trim())}
            style={{fontSize:9,padding:"3px 10px",cursor:digestLoading?"not-allowed":"pointer",background:"rgba(80,180,120,0.15)",border:"1px solid rgba(80,180,120,0.3)",color:S.green,textTransform:"uppercase"}}>
            {digestLoading?"REQUESTING...":"REQUEST DIGEST"}
          </button>
          <span style={{fontSize:9,color:"#555"}}>or use mock mode below</span>
        </div>
        <textarea value={mockDigest} onChange={e=>setMockDigest(e.target.value)}
          placeholder="Mock mode: write your own digest text here (used when API is unavailable)..."
          style={{width:"100%",minHeight:40,marginTop:6,background:"#0c0c14",border:\`1px solid rgba(200,180,140,0.06)\`,color:"#888",padding:8,fontSize:10,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
      </div>

      {/* Digest result */}
      {digestResult&&(
        <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`}}>
          <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:4}}>
            Digest Result {digestResult.error&&<span style={{color:"#e06040"}}>· API: {digestResult.error}</span>}
          </div>
          <div style={{padding:8,background:"rgba(200,180,140,0.03)",border:\`1px solid rgba(200,180,140,0.08)\`,fontSize:11,color:"#b8a878",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{digestResult.digest}</div>
        </div>
      )}

      {/* Keyword + Judgment */}
      {(digestResult||mockDigest.trim())&&(
        <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`}}>
          <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Judgment · Keywords · Record</div>
          <input value={obsKeywords} onChange={e=>setObsKeywords(e.target.value)}
            placeholder="Nominate keywords (comma-separated) for potential lock-in..."
            style={{width:"100%",background:"#0c0c14",border:\`1px solid \${S.border}\`,color:"#b8a878",padding:6,fontSize:10,marginBottom:6,boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {OBS_STATES.map(state=>(
              <button key={state} onClick={()=>recordObservation(state)}
                style={{fontSize:9,padding:"4px 10px",cursor:"pointer",background:\`\${OBS_COLORS[state]}15\`,border:\`1px solid \${OBS_COLORS[state]}40\`,color:OBS_COLORS[state],textTransform:"uppercase"}}>
                {state}
              </button>
            ))}
          </div>
          <div style={{fontSize:9,color:"#555",marginTop:4}}>
            Keywords lock only on "confirmed." "Reverse-and-rebuild" revokes active lock-ins at this node.
          </div>
        </div>
      )}

      {/* Active lock-ins */}
      {(curLockins.length>0||curNeighborLk.length>0)&&(
        <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`}}>
          <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>
            Lock-ins · {curLockins.length} at node · {curNeighborLk.length} from neighbors
          </div>
          {curLockins.map((lk,i)=>(
            <div key={i} style={{display:"flex",gap:8,fontSize:10,padding:"2px 0"}}>
              <span style={{color:OBS_COLORS.confirmed,fontWeight:700}}>■</span>
              <span style={{color:"#b8a878"}}>{lk.keyword}</span>
              <span style={{color:"#555",fontSize:9}}>locked {lk.locked_at?.slice(0,10)} · weight: 1.0</span>
            </div>
          ))}
          {curNeighborLk.map((lk,i)=>(
            <div key={\`n\${i}\`} style={{display:"flex",gap:8,fontSize:10,padding:"2px 0",opacity:0.7}}>
              <span style={{color:OBS_COLORS.confirmed}}>□</span>
              <span style={{color:"#b8a878"}}>{lk.keyword}</span>
              <span style={{color:"#555",fontSize:9}}>from Y={NODE_YS[lk.fromIdx]} · weight: {lk.weight}</span>
            </div>
          ))}
        </div>
      )}

      {/* Observation history at node */}
      <div style={{padding:10}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Observation History · Y={viewY.toFixed(4)} · {curObs.length} record(s)</div>
        {curObs.length===0&&<div style={{fontSize:10,color:"#555"}}>No observations recorded at this position</div>}
        {curObs.slice().reverse().map((o,i)=>(
          <div key={i} style={{padding:"6px 8px",marginBottom:3,borderLeft:\`3px solid \${OBS_COLORS[o.state]}\`,background:"rgba(200,180,140,0.02)",fontSize:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
              <span style={{color:OBS_COLORS[o.state],fontWeight:700,textTransform:"uppercase",fontSize:9}}>{o.state}</span>
              <span style={{color:"#555",fontSize:9}}>{o.timestamp?.slice(0,16)}</span>
            </div>
            {o.prompt&&<div style={{color:"#555",fontSize:9}}>Prompt: {o.prompt.slice(0,100)}</div>}
            <div style={{color:"#b8a878"}}>{o.digest?.slice(0,200)}{o.digest?.length>200?"...":""}</div>
            {o.keywords?.length>0&&<div style={{color:S.acc,fontSize:9,marginTop:2}}>Keywords: {o.keywords.join(", ")}</div>}
          </div>
        ))}
      </div>
    </div>
    )}

    {/* ══════════════ TAB: EDGES — Outgoing/Incoming + Project ══════════════ */}
    {tab==="edges"&&(
    <div style={{border:\`1px solid \${S.border}\`,marginBottom:10}}>
      <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Outgoing Edges · {outEdges.length} from Y={NODE_YS[currentIdx]}</div>
        {outEdges.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:8,fontSize:10,padding:"3px 0",alignItems:"center"}}>
            <span style={{color:S.green}}>→</span>
            <span style={{color:"#b8a878"}}>Y={e.toY}</span>
            <span style={{color:"#555",fontSize:9}}>Δ{e.weight.toFixed(4)} ({(e.weight*curA).toFixed(0)} days)</span>
            <span style={{color:"#555",fontSize:9}}>ETA: {fd(new Date(Date.now()+e.weight*curA*MSD))}</span>
            <button onClick={()=>recordProjection(e)}
              style={{fontSize:8,padding:"2px 6px",background:"rgba(192,128,255,0.1)",border:"1px solid rgba(192,128,255,0.2)",color:S.travel,cursor:"pointer"}}>
              PROJECT
            </button>
            <span onClick={()=>{setTravelY(e.toY);setSelectedIdx(e.to);}} style={{color:S.travel,cursor:"pointer",fontSize:9}}>⟶ travel</span>
          </div>
        ))}
      </div>
      <div style={{padding:10}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:6}}>Incoming Edges · {inEdges.length} to Y={NODE_YS[currentIdx]}</div>
        {inEdges.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:8,fontSize:10,padding:"3px 0",alignItems:"center"}}>
            <span style={{color:S.acc}}>←</span>
            <span style={{color:"#b8a878"}}>Y={e.fromY}</span>
            <span style={{color:"#555",fontSize:9}}>Δ{e.weight.toFixed(4)}</span>
            <span onClick={()=>{setTravelY(e.fromY);setSelectedIdx(e.from);}} style={{color:S.travel,cursor:"pointer",fontSize:9}}>⟵ travel</span>
          </div>
        ))}
      </div>
    </div>
    )}

    {/* ══════════════ TAB: PROJECTIONS — Pending + Resolution ══════════════ */}
    {tab==="projections"&&(
    <div style={{border:\`1px solid \${S.border}\`,marginBottom:10,padding:10}}>
      <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:8}}>
        Projections · {obsStore.projections.length} total · {calibration.open} open · {calibration.resolved} resolved
      </div>
      {obsStore.projections.length===0&&<div style={{fontSize:10,color:"#555"}}>No projections recorded. Use the EDGES tab to project along outgoing edges.</div>}
      {obsStore.projections.slice().reverse().map((p,i)=>(
        <div key={i} style={{padding:"8px 10px",marginBottom:4,background:"rgba(192,128,255,0.03)",border:\`1px solid rgba(192,128,255,0.1)\`,fontSize:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{color:S.travel}}>Y={p.sourceY.toFixed(3)} → Y={p.targetY.toFixed(3)} (Δ{p.edgeWeight.toFixed(4)})</span>
            <span style={{color:p.resolution_state?OBS_COLORS[p.resolution_state]||"#888":"#555",fontSize:9,fontWeight:700,textTransform:"uppercase"}}>
              {p.resolution_state||"OPEN"}
            </span>
          </div>
          <div style={{color:"#555",fontSize:9}}>
            Projected: {p.projected_at?.slice(0,10)} · Expected arrival: {p.expected_arrival?.slice(0,10)}
            {p.resolved_at&&\` · Resolved: \${p.resolved_at?.slice(0,10)}\`}
          </div>
          <div style={{color:"#b8a878",fontSize:10,marginTop:2}}>{p.digest?.slice(0,150)}</div>
          {!p.resolution_state&&(
            <div style={{display:"flex",gap:4,marginTop:4}}>
              {["confirmed","rejected","reverse-and-rebuild"].map(st=>(
                <button key={st} onClick={()=>resolveProjection(p.id,st)}
                  style={{fontSize:8,padding:"2px 8px",cursor:"pointer",background:\`\${OBS_COLORS[st]}15\`,border:\`1px solid \${OBS_COLORS[st]}40\`,color:OBS_COLORS[st],textTransform:"uppercase"}}>
                  {st}
                </button>
              ))}
              <span onClick={()=>{setTravelY(p.targetY);}} style={{color:S.travel,cursor:"pointer",fontSize:9,marginLeft:8}}>⟶ travel to target</span>
            </div>
          )}
        </div>
      ))}
    </div>
    )}

    {/* ══════════════ TAB: FEEDS — RSS Knowledge Servers ══════════════ */}
    {tab==="feeds"&&(
    <div style={{border:\`1px solid \${S.border}\`,marginBottom:10,padding:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#555"}}>Knowledge-Server Feeds · {NEWS_FEEDS.length} sources</div>
        <button onClick={fetchFeeds} disabled={feedLoading||Date.now()-feedLastFetch<60000}
          style={{fontSize:9,padding:"3px 10px",cursor:feedLoading?"not-allowed":"pointer",background:"rgba(80,180,120,0.15)",border:"1px solid rgba(80,180,120,0.3)",color:S.green,textTransform:"uppercase"}}>
          {feedLoading?"FETCHING...":Date.now()-feedLastFetch<60000?\`WAIT \${Math.ceil(60-(Date.now()-feedLastFetch)/1000)}s\`:"FETCH ALL FEEDS"}
        </button>
      </div>
      {feedResults.news&&feedResults.news.map((fr,i)=>(
        <div key={i} style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:10,fontWeight:700,color:S.acc}}>{fr.source}</span>
            <span style={{fontSize:9,color:fr.error?"#e06040":S.green}}>{fr.error?\`ERROR: \${fr.error}\`:\`\${fr.items.length} items\`}</span>
          </div>
          {fr.items.slice(0,5).map((item,j)=>(
            <div key={j} style={{padding:"3px 8px",marginBottom:2,background:"rgba(200,180,140,0.02)",borderLeft:"2px solid rgba(200,180,140,0.1)",fontSize:10}}>
              <a href={item.link} target="_blank" rel="noopener noreferrer" style={{color:"#b8a878",textDecoration:"none"}}>{item.title}</a>
              {item.pubDate&&<span style={{color:"#555",fontSize:8,marginLeft:8}}>{item.pubDate.slice(0,16)}</span>}
            </div>
          ))}
        </div>
      ))}
      {!feedResults.news&&<div style={{fontSize:10,color:"#555"}}>Press FETCH ALL FEEDS to query knowledge servers via Vite proxy.</div>}
    </div>
    )}

    {/* ══════════════ TAB: CALIBRATION — Projection Resolution Register ══════════════ */}
    {tab==="calibration"&&(
    <div style={{border:\`1px solid \${S.border}\`,marginBottom:10,padding:10}}>
      <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:8}}>Calibration Register · Forecast Verification</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:12}}>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:S.travel,fontWeight:700}}>{calibration.total}</div><div style={{fontSize:9,color:"#555"}}>Total Projections</div></div>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:S.acc,fontWeight:700}}>{calibration.open}</div><div style={{fontSize:9,color:"#555"}}>Open</div></div>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:OBS_COLORS.confirmed,fontWeight:700}}>{calibration.confirmed}</div><div style={{fontSize:9,color:"#555"}}>Confirmed</div></div>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:OBS_COLORS["reverse-and-rebuild"],fontWeight:700}}>{calibration.reversed}</div><div style={{fontSize:9,color:"#555"}}>Reversed</div></div>
        <div style={{background:S.panelBg,padding:8,textAlign:"center"}}><div style={{fontSize:18,color:S.acc,fontWeight:700}}>{calibration.rate}</div><div style={{fontSize:9,color:"#555"}}>Confirm Rate</div></div>
      </div>
      <div style={{fontSize:10,color:"#888",lineHeight:1.6}}>
        The calibration register tracks the empirical reliability of the SFO-WAM temporal embedding as a predictive 
        framework. This is analogous to forecast verification: it measures how well the structural hypothesis 
        (the invariant 399-node DAG topology) performs against unfolding reality. It does not constitute causal 
        proof but rather observational evidence for or against the structural invariance claim.
      </div>
    </div>
    )}

    {/* ══════════════ TAB: HISTORY — Full observation log ══════════════ */}
    {tab==="history"&&(
    <div style={{border:\`1px solid \${S.border}\`,marginBottom:10,padding:10}}>
      <div style={{fontSize:9,textTransform:"uppercase",color:"#555",marginBottom:8}}>
        Full Observation Log · {obsStore.observations.length} observation(s) · {obsStore.lockins.length} lock-in(s) · {obsStore.projections.length} projection(s)
      </div>
      <div style={{maxHeight:400,overflow:"auto"}}>
        {obsStore.observations.slice().reverse().map((o,i)=>(
          <div key={i} style={{padding:"4px 8px",marginBottom:2,borderLeft:\`3px solid \${OBS_COLORS[o.state]}\`,background:"rgba(200,180,140,0.02)",fontSize:10}}>
            <span style={{color:OBS_COLORS[o.state],fontWeight:700,fontSize:9}}>{o.state}</span>
            <span style={{color:"#555",fontSize:9,marginLeft:8}}>Y={o.nodeY.toFixed(3)} · {o.timestamp?.slice(0,16)}</span>
            {o.travelY!==null&&<span style={{color:S.travel,fontSize:9,marginLeft:8}}>⟳ time-travel from Y={o.liveY?.toFixed(3)}</span>}
            <div style={{color:"#b8a878",marginTop:1}}>{o.digest?.slice(0,120)}</div>
          </div>
        ))}
      </div>
      {/* Summary */}
      <div style={{padding:"6px 0",borderTop:\`1px solid \${S.border}\`,marginTop:8,fontSize:9,color:"#555",display:"flex",gap:12,flexWrap:"wrap"}}>
        {OBS_STATES.map(st=><span key={st}><span style={{color:OBS_COLORS[st]}}>■</span> {st}: {obsStore.observations.filter(o=>o.state===st).length}</span>)}
        <span>Active lock-ins: {obsStore.lockins.filter(l=>l.state==="active").length}</span>
        <span>Reversed lock-ins: {obsStore.lockins.filter(l=>l.state==="reversed").length}</span>
      </div>
    </div>
    )}

    {/* ══════════════ TAB: FORGE — Create SFOs on the fly ══════════════ */}
    {tab==="forge"&&(
    <div style={{border:\`1px solid \${S.border}\`,marginBottom:10}}>

      {/* Active SFO indicator */}
      {overrideA!==null&&(
        <div style={{padding:"8px 12px",background:"rgba(255,20,147,0.06)",borderBottom:\`1px solid rgba(255,20,147,0.15)\`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:10,color:S.pink}}>Active: <b>{curLabel}</b> (A={curA}, C={curC.toFixed(2)})</span>
          <button onClick={switchToProps} style={{fontSize:9,padding:"3px 10px",cursor:"pointer",background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.25)",color:S.acc}}>
            RETURN TO {sfoLabel}
          </button>
        </div>
      )}

      {/* Mode selector */}
      <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:S.pink,letterSpacing:"0.08em",marginBottom:8}}>
          SFO Forge — Sense where canonical BB positions fall on the timeline
        </div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {[["anchors","ANCHOR PAIRS (2+)"],["one_plus_A","ONE ANCHOR + KNOWN A"]].map(([m,label])=>(
            <button key={m} onClick={()=>setForgeMode(m)} style={{
              padding:"4px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:9,
              background:forgeMode===m?"rgba(255,20,147,0.1)":"transparent",
              border:\`1px solid \${forgeMode===m?"rgba(255,20,147,0.3)":S.border}\`,
              color:forgeMode===m?S.pink:"#888"
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Anchor inputs */}
      <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`}}>
        {forgeAnchors.map((anc,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"120px 1fr 1fr 30px",gap:8,alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:9,color:S.acc}}>Anchor {i+1}</div>
            <div>
              <input value={anc.y} onChange={e=>{const na=[...forgeAnchors];na[i]={...na[i],y:e.target.value};setForgeAnchors(na);}}
                placeholder="BB (Y)" style={{width:"100%",background:"#0c0c14",border:\`1px solid \${S.border}\`,color:S.fg,padding:"5px 8px",fontFamily:"inherit",fontSize:11,boxSizing:"border-box"}} />
            </div>
            <div>
              <input type="date" value={anc.date} onChange={e=>{const na=[...forgeAnchors];na[i]={...na[i],date:e.target.value};setForgeAnchors(na);}}
                style={{width:"100%",background:"#0c0c14",border:\`1px solid \${S.border}\`,color:S.fg,padding:"4px 8px",fontFamily:"inherit",fontSize:10,boxSizing:"border-box"}} />
            </div>
            {forgeAnchors.length>2&&(
              <button onClick={()=>setForgeAnchors(prev=>prev.filter((_,j)=>j!==i))}
                style={{background:"rgba(224,96,64,0.1)",border:"1px solid rgba(224,96,64,0.2)",color:"#e06040",cursor:"pointer",fontSize:10,padding:"2px 6px"}}>x</button>
            )}
          </div>
        ))}

        {/* Add anchor button (for least-squares with 3+) */}
        {forgeMode==="anchors"&&(
          <button onClick={()=>setForgeAnchors(prev=>[...prev,{y:"",date:""}])}
            style={{fontSize:9,padding:"3px 10px",cursor:"pointer",background:"rgba(192,128,255,0.1)",border:"1px solid rgba(192,128,255,0.2)",color:S.travel,marginBottom:8}}>
            + ADD ANCHOR {forgeAnchors.length>=3?"(least-squares)":""}
          </button>
        )}

        {/* Direct A input (one_plus_A mode) */}
        {forgeMode==="one_plus_A"&&(
          <div style={{marginTop:8}}>
            <div style={{fontSize:9,color:"#888",marginBottom:3}}>Known A (TNLDY days per Y-unit)</div>
            <input value={forgeDirectA} onChange={e=>setForgeDirectA(e.target.value)} placeholder="e.g. 100, 360, 365.2422..."
              style={{width:"100%",background:"#0c0c14",border:\`1px solid \${S.border}\`,color:S.fg,padding:"5px 8px",fontFamily:"inherit",fontSize:11,boxSizing:"border-box",marginBottom:6}} />
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {[100,360,365.2422,365.25,48.3].map(a=>(
                <button key={a} onClick={()=>setForgeDirectA(String(a))}
                  style={{fontSize:8,padding:"2px 6px",cursor:"pointer",
                    background:parseFloat(forgeDirectA)===a?"rgba(192,128,255,0.1)":"transparent",
                    border:\`1px solid \${parseFloat(forgeDirectA)===a?"rgba(192,128,255,0.3)":S.border}\`,
                    color:parseFloat(forgeDirectA)===a?S.travel:"#888"
                  }}>A={a}{a===360?" (yJ)":a===365.2422?" (trop)":a===48.3?" (sfo22)":""}</button>
              ))}
            </div>
          </div>
        )}

        {/* Anchor presets */}
        <div style={{marginTop:8,fontSize:9,color:"#666"}}>Quick-set BB positions:</div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>
          {ANCHOR_PRESETS.map(p=>(
            <button key={p.y} onClick={()=>{
              const empty=forgeAnchors.findIndex(a=>!a.y);
              if(empty>=0){const na=[...forgeAnchors];na[empty]={...na[empty],y:String(p.y)};setForgeAnchors(na);}
            }} title={p.hint}
              style={{fontSize:8,padding:"2px 6px",cursor:"pointer",background:"transparent",border:\`1px solid \${S.border}\`,color:"#888"}}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Solution */}
      {forgeSolution&&forgePreview&&(
        <div style={{padding:10,borderBottom:\`1px solid \${S.border}\`,background:"rgba(255,20,147,0.03)"}}>
          <div style={{fontSize:9,textTransform:"uppercase",color:S.pink,letterSpacing:"0.08em",marginBottom:8}}>
            SOLVED — {forgeSolution.method}{forgeSolution.residual>0?\` · RMSE=\${forgeSolution.residual.toFixed(6)}\`:""}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:10}}>
            <div style={{background:"rgba(255,20,147,0.06)",padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:S.pink}}>{forgeSolution.A}</div>
              <div style={{fontSize:9,color:"#888"}}>A (coefficient)</div>
            </div>
            <div style={{background:"rgba(240,192,64,0.06)",padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:S.acc}}>{forgeSolution.C.toFixed(4)}</div>
              <div style={{fontSize:9,color:"#888"}}>C (ZTP)</div>
            </div>
            <div style={{background:"rgba(192,128,255,0.06)",padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:S.travel}}>{forgePreview.yNow}</div>
              <div style={{fontSize:9,color:"#888"}}>Y now (BB={forgePreview.bbNodeY})</div>
            </div>
            <div style={{background:S.panelBg,padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#b8a878"}}>{forgePreview.spanYears}yr</div>
              <div style={{fontSize:9,color:"#888"}}>{forgePreview.dateFirst} to {forgePreview.dateLast}</div>
            </div>
          </div>

          {/* Equation */}
          <div style={{background:"#0c0c14",padding:"6px 10px",border:\`1px solid \${S.border}\`,marginBottom:10,fontSize:11,textAlign:"center"}}>
            <code style={{color:S.acc}}>Z = {forgeSolution.A} * Y + {forgeSolution.C.toFixed(4)}</code>
          </div>

          {/* Timeline: toggle preview (17) vs full (399) + CSV download */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={()=>setShowFull399(false)} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",
                background:!showFull399?"rgba(255,20,147,0.1)":"transparent",
                border:\`1px solid \${!showFull399?"rgba(255,20,147,0.3)":S.border}\`,color:!showFull399?S.pink:"#888"}}>
                KEY NODES (17)
              </button>
              <button onClick={()=>setShowFull399(true)} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",
                background:showFull399?"rgba(255,20,147,0.1)":"transparent",
                border:\`1px solid \${showFull399?"rgba(255,20,147,0.3)":S.border}\`,color:showFull399?S.pink:"#888"}}>
                FULL 399 NODES
              </button>
            </div>
            <button onClick={()=>downloadCSV(forgePreview.full399,(forgeName.trim()||"sfo")+"_399_timeline.csv")}
              style={{fontSize:9,padding:"2px 10px",cursor:"pointer",background:"rgba(80,180,120,0.1)",border:"1px solid rgba(80,180,120,0.25)",color:S.green}}>
              DOWNLOAD CSV (399)
            </button>
          </div>
          <div style={{maxHeight:showFull399?500:250,overflow:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead><tr style={{borderBottom:\`1px solid \${S.border}\`,color:"#888",textAlign:"left",position:"sticky",top:0,background:S.bg}}>
                <th style={{padding:"3px 6px"}}>BB</th><th style={{padding:"3px 6px"}}>TNLDY</th>
                <th style={{padding:"3px 6px"}}>Calendar</th><th style={{padding:"3px 6px"}}>From Now</th>
              </tr></thead>
              <tbody>{(showFull399?forgePreview.full399:forgePreview.timeline).map((p,i)=>(
                <tr key={i} style={{borderBottom:"1px solid rgba(200,180,140,0.04)",
                  background:p.y===0?"rgba(240,192,64,0.04)":Math.abs(p.y-forgePreview.bbNodeY)<0.5?"rgba(255,20,147,0.05)":"transparent"}}>
                  <td style={{padding:"3px 6px",color:p.y===0?S.acc:"#b8a878",fontWeight:p.y===0?700:400}}>{p.y.toFixed(4)}{p.y===0?" <ZTP":""}</td>
                  <td style={{padding:"3px 6px",color:"#888"}}>{p.z.toFixed(4)}</td>
                  <td style={{padding:"3px 6px"}}>{p.date}</td>
                  <td style={{padding:"3px 6px",color:p.isPast?S.green:p.daysFromNow<90?S.acc:"#888"}}>
                    {p.isPast?Math.abs(p.daysFromNow)+"d ago":"in "+p.daysFromNow+"d"}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {/* Name + Create */}
          <div style={{marginTop:10,display:"flex",gap:8,alignItems:"center"}}>
            <input value={forgeName} onChange={e=>setForgeName(e.target.value)}
              placeholder="Name this SFO..."
              style={{flex:1,background:S.inputBg,border:\`1px solid \${S.border}\`,color:S.fg,padding:"5px 10px",fontFamily:"inherit",fontSize:11,boxSizing:"border-box"}} />
            <button onClick={createForgedSFO} disabled={!forgeName.trim()}
              style={{padding:"5px 16px",cursor:forgeName.trim()?"pointer":"not-allowed",
                background:forgeName.trim()?"rgba(255,20,147,0.15)":S.btnDisabledBg,
                border:\`1px solid \${forgeName.trim()?"rgba(255,20,147,0.4)":S.btnDisabledBorder}\`,
                color:forgeName.trim()?S.pink:S.fgMuted,fontFamily:"inherit",fontSize:10,fontWeight:700
              }}>CREATE SFO</button>
          </div>

          {/* Success toast — auto-dismisses after 3 s */}
          {forgeToast&&(
            <div style={{marginTop:8,padding:"6px 12px",
              background:"rgba(255,20,147,0.1)",border:\`1px solid rgba(255,20,147,0.35)\`,
              color:S.pink,fontSize:10,fontWeight:700,letterSpacing:"0.04em"}}>
              ✓ "{forgeToast}" added to registry
            </div>
          )}
        </div>
      )}

      {/* Forged SFO Registry */}
      <div style={{padding:10}}>
        <div style={{fontSize:9,textTransform:"uppercase",color:"#888",letterSpacing:"0.08em",marginBottom:6}}>
          SFO Registry · {forgedSFOs.length} forged + 1 props-default ({sfoLabel})
        </div>

        {/* Props-default SFO */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",marginBottom:3,
          background:overrideA===null?"rgba(240,192,64,0.06)":"rgba(200,180,140,0.02)",
          border:\`1px solid \${overrideA===null?"rgba(240,192,64,0.15)":"rgba(200,180,140,0.05)"}\`}}>
          <div>
            <span style={{color:overrideA===null?S.acc:"#888",fontWeight:700,marginRight:8}}>{sfoLabel}</span>
            <span style={{fontSize:9,color:"#888"}}>A={agentA} C={agentC} (props)</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {overrideA===null?<span style={{fontSize:9,color:S.green,fontWeight:700}}>ACTIVE</span>:
              <button onClick={switchToProps} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",background:"rgba(240,192,64,0.1)",border:"1px solid rgba(240,192,64,0.25)",color:S.acc}}>ACTIVATE</button>}
          </div>
        </div>

        {/* Forged SFOs */}
        {forgedSFOs.map(sfo=>{
          const isActive=overrideLabel===sfo.name;
          const store=isActive?obsStore:(sfoStores[sfo.name]||{observations:[],lockins:[],projections:[]});
          return(
            <div key={sfo.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",marginBottom:3,
              background:isActive?"rgba(255,20,147,0.06)":"rgba(200,180,140,0.02)",
              border:\`1px solid \${isActive?"rgba(255,20,147,0.15)":"rgba(200,180,140,0.05)"}\`}}>
              <div>
                <span style={{color:isActive?S.pink:"#b8a878",fontWeight:700,marginRight:8}}>{sfo.name}</span>
                <span style={{fontSize:9,color:"#888"}}>A={sfo.A} C={sfo.C.toFixed(2)} {sfo.method}</span>
                <span style={{fontSize:9,color:"#666",marginLeft:8}}>{store.observations.length} obs, {store.lockins.filter(l=>l.state==="active").length} lk, {store.projections.length} proj</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {isActive?<span style={{fontSize:9,color:S.green,fontWeight:700}}>ACTIVE</span>:
                  <button onClick={()=>switchToSFO(sfo)} style={{fontSize:9,padding:"2px 8px",cursor:"pointer",background:"rgba(255,20,147,0.1)",border:"1px solid rgba(255,20,147,0.25)",color:S.pink}}>ACTIVATE</button>}
                <button onClick={()=>downloadCSV(sfo.timeline399||forgeTimelineAll(sfo.A,sfo.C),sfo.name+"_399.csv")}
                  style={{fontSize:8,padding:"2px 6px",cursor:"pointer",background:"rgba(80,180,120,0.08)",border:"1px solid rgba(80,180,120,0.2)",color:S.green}}>CSV</button>
                <span style={{fontSize:8,color:"#555"}}>{sfo.created.slice(0,10)}</span>
              </div>
            </div>
          );
        })}

        {forgedSFOs.length===0&&(
          <div style={{fontSize:10,color:"#666",padding:"8px 0"}}>
            No SFOs forged yet. Set anchor observations above, solve the system, name it, and create.
          </div>
        )}

        {/* Philosophy note */}
        <div style={{marginTop:10,padding:"8px 10px",background:S.panelBg,border:\`1px solid \${S.border}\`,fontSize:10,color:"#888",lineHeight:1.6}}>
          The SFO is the atom of the build. Every SFO shares the invariant 399-node / 701-edge DAG
          topology but traverses it at a rate (A) and phase (C) determined by where the engineer senses
          its canonical positions meeting reality. Two anchor observations solve the system exactly.
          Three or more invoke least-squares regression for overdetermined systems.
          Each forged SFO maintains its own observation store, lock-in registry, and projection queue.
        </div>
      </div>
    </div>
    )}

  </div>);
}
`;const R=Object.assign({"./py/fastapi/__init__.py":v,"./py/fastapi/middleware/cors.py":b,"./py/fastapi/responses.py":w,"./py/httpx.py":z,"./py/jomo_clock.py":x,"./py/jomo_dispatch.py":k}),_={"backend/main.py":E,"backend/research_agent.py":S,"src/agent_registry_verified.json":A,"src/sfo_wam_engine.jsx":N};for(const[n,e]of Object.entries(R))_["kernel/"+n.slice(2)]=e;let l,r,m,y=!1;async function O(n){try{r.FS.mount(r.FS.filesystems.IDBFS,{},n),await new Promise((e,a)=>r.FS.syncfs(!0,d=>d?a(d):e())),y=!0}catch(e){console.warn("[kernel] storage unavailable; this session will not be kept:",e)}}let u=!1,h=!1;function g(){if(y){if(u){h=!0;return}u=!0,r.FS.syncfs(!1,n=>{n&&console.warn("[kernel] save failed:",n),u=!1,h&&(h=!1,g())})}}setInterval(g,5e3);async function j(n){const{loadPyodide:e}=await import(n+"pyodide.mjs");r=await e({indexURL:n}),l=await T(r,_,{persist:O,prelude:"import jomo_clock"})}self.onmessage=async({data:n})=>{if(n.type==="boot"){m=j(n.pyodideURL),m.then(()=>self.postMessage({type:"ready"}),e=>self.postMessage({type:"boot-failed",error:String(e&&e.message||e)}));return}if(await m,n.type==="request"){let e;try{e=await l.request(n.method,n.url,n.body)}catch(a){console.error(a),e={status:500,media_type:"text/plain",body:"Internal Server Error"}}self.postMessage({type:"response",id:n.id,...e}),n.method!=="GET"&&g()}else if(n.type==="open-stream"){const e=await l.openStream(n.sid,n.url,a=>self.postMessage({type:"chunk",sid:n.sid,text:a}));self.postMessage({type:"stream-open",sid:n.sid,...e})}else n.type==="close-stream"&&l.closeStream(n.sid)};
