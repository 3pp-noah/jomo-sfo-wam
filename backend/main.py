from __future__ import annotations

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
    match = re.search(rf"const\s+{name}\s*=\s*(\[.*?\]);", text, re.S)
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
        line = f"data: {json.dumps(payload)}\n\n"
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
    text = "\n".join(block.get("text", "") for block in data.get("content", []) if block.get("type") == "text")
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
            yield f"data: {json.dumps({'type': 'connected', 'service': 'jomo-sfo-wam-research-agent-kernel'})}\n\n"
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
