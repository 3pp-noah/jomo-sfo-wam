from __future__ import annotations

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
        return self.store.create_digest(req.digest_type, title, "\n".join(lines), {
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
