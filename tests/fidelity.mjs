// Fidelity of the in-page kernel against the real FastAPI backend.
//
//   node tests/fidelity.mjs http://127.0.0.1:8043
//
// The reference must be tests/reference_app.py under uvicorn, started from a fresh copy of the
// project (empty runtime_state) with no ANTHROPIC_API_KEY. Both sides run on the same stepping
// clock (tests/fake_clock.py), receive the same requests in the same order, and each response
// is compared as status + body after replacing only what differs between any two runs of the
// same backend: uuids (random) and the database path. Results go to tests/fidelity.json.

import { writeFileSync } from "node:fs";
import { nodeKernel } from "./kernel-node.mjs";

const REF = process.argv[2];
if (!REF) throw new Error("usage: node tests/fidelity.mjs <reference base URL>");

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

function normalise(v, key = "") {
  if (key === "db_path") return "<db_path>";
  if (typeof v === "string") return v.replace(UUID, "<uuid>");
  if (Array.isArray(v)) return v.map((x) => normalise(x));
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalise(x, k)]));
  return v;
}

async function viaRef(method, url, body) {
  const r = await fetch(REF + url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body });
  return { status: r.status, text: await r.text() };
}

const kernel = await nodeKernel({ fakeClock: true });
async function viaKernel(method, url, body) {
  const r = await kernel.request(method, url, body);
  return { status: r.status, text: r.body };
}

const J = (o) => JSON.stringify(o);
// Each step: [method, url or (side state) => url, body or (side state) => body, remember?]
const steps = [
  ["GET", "/api/health"],
  ["GET", "/api/kernel/status"],
  ["GET", "/api/graph/summary"],
  ["GET", "/api/graph/node/0"], ["GET", "/api/graph/node/200"], ["GET", "/api/graph/node/398"],
  ["GET", "/api/graph/node/399"], ["GET", "/api/graph/node/abc"],
  ["POST", "/api/graph/dsep", J({ node_idx: 12, conditioned_nodes: [] })],
  ["POST", "/api/graph/dsep", J({ node_idx: 200, conditioned_nodes: [150, 199, 201, 250] })],
  ["POST", "/api/graph/dsep", J({ node_idx: 999 })],
  ["POST", "/api/graph/dsep", "{not json"],
  ["GET", "/api/runtime/status"],
  ["GET", "/api/runtime/agents?limit=20"],
  ["POST", "/api/runtime/tick"], ["POST", "/api/runtime/tick"], ["POST", "/api/runtime/tick"],
  ["GET", "/api/runtime/events?limit=5"],
  ["GET", "/api/runtime/events?limit=zero"],
  ["POST", "/api/observations", J({ node_idx: 369, prompt: "fidelity", digest: "d", keywords: ["a", "b"], confidence: 0.7 })],
  ["POST", "/api/observations", J({ node_y: 17.25, prompt: "nearest" })],
  ["GET", "/api/observations?limit=3"],
  ["POST", "/api/judgments", J({ node_idx: 369, state: "confirmed", rationale: "fidelity", judge: "human", confidence: 0.9, create_lockin: true })],
  ["POST", "/api/judgments", J({ node_idx: 120, state: "conditioned" })],
  ["POST", "/api/judgments", J({ node_idx: 120, confidence: 2 })],
  ["GET", "/api/judgments?limit=5"],
  ["GET", "/api/lockins"],
  ["POST", "/api/projections", J({ source_idx: 10, target_idx: 11, prompt: "p" }), "projection"],
  ["GET", "/api/projections?limit=5"],
  ["POST", (s) => `/api/projections/${s.projection.id}/resolve`, J({ resolution_state: "rejected", rationale: "r" })],
  ["POST", "/api/digest/tasks", J({ node_idx: 5, prompt: "task", priority: 7 }), "task"],
  ["GET", "/api/digest/tasks"],
  ["POST", (s) => `/api/digest/tasks/${s.task.id}/run`],
  ["GET", "/api/coordination/summary"],
  ["GET", "/api/research/status"],
  ["POST", "/api/research/cycle/run", J({ limit: 10, autonomous: false })],
  ["POST", "/api/research/cycle/run", J({ limit: 6, autonomous: true })],
  ["GET", "/api/research/goals"],
  ["POST", "/api/research/goals", J({ title: "Fidelity goal", description: "Is the port faithful?", priority: 7 }), "goal"],
  ["GET", (s) => `/api/research/goals/${s.goal.id}`],
  ["PATCH", (s) => `/api/research/goals/${s.goal.id}`, J({ status: "paused" })],
  ["GET", "/api/research/hypotheses?limit=8"],
  ["GET", "/api/research/hypotheses/1"],
  ["PATCH", "/api/research/hypotheses/1", J({ confidence: 0.4 })],
  ["POST", "/api/research/tests/run", J({ test_type: "node_stability", input: { node_idx: 369 } })],
  ["POST", "/api/research/tests/run", J({ test_type: "dsep_before_after_lockin", input: { node_idx: 120 } })],
  ["GET", "/api/research/tests?limit=5"],
  ["GET", "/api/research/tests/1"],
  ["GET", "/api/research/evidence-scores?limit=5"],
  ["GET", "/api/research/evidence-scores/1"],
  ["GET", "/api/research/episodes?limit=8"],
  ["GET", "/api/research/episodes/1"],
  ["POST", "/api/research/episodes", J({ title: "Fidelity episode", question: "Same answers?" })],
  ["POST", "/api/research/hypotheses", J({ title: "H", claim: "c", hypothesis_type: "manual", node_idx: 5 })],
  ["POST", "/api/research/policy-rules", J({ name: "r", rule_type: "manual" })],
  ["PATCH", "/api/research/policy-rules/1", J({ enabled: false })],
  ["POST", "/api/research/review-queue", J({ item_type: "manual", item_id: "x", title: "t" })],
  ["GET", "/api/research/policy-rules"],
  ["GET", "/api/research/review-queue?limit=12&status=open"],
  ["POST", "/api/research/review-queue/1/resolve", J({ status: "deferred", resolution: "later" })],
  ["POST", "/api/research/review-queue/1/resolve", J({ status: "nonsense" })],
  ["POST", "/api/research/digests/generate", J({ digest_type: "daily_kernel_digest" })],
  ["GET", "/api/research/digests?limit=8"],
  ["GET", "/api/research/digests/1"],
  ["GET", "/api/research/digests/999"],
  ["GET", "/api/research/status"],
  ["POST", "/api/forge", J({ name: "fidelity-agent", ns: "sfo00", ztp: 17651.8, coeff: 100 })],
  ["POST", "/api/forge", J({ name: "fidelity-agent", ns: "sfo00", ztp: 17651.8, coeff: 100 })],
  ["POST", "/api/forge", J({ name: "incomplete" })],
  ["POST", "/api/digest", J({ prompt: "digest please" })],
  ["POST", "/api/runtime/start", J({ agent_limit: 32, tick_seconds: 60, autonomous_kernel: true, research_agent: true, research_cycle_every_ticks: 1 })],
  ["POST", "/api/runtime/stop"],
  ["GET", "/api/runtime/status"],
  ["GET", "/api/kernel/status"],
  ["GET", "/api/nowhere"],
  ["DELETE", "/api/health"],
];

const results = [];
const state = { ref: {}, kernel: {} };
for (const [method, url, body, remember] of steps) {
  const pair = {};
  for (const [side, call] of [["ref", viaRef], ["kernel", viaKernel]]) {
    const u = typeof url === "function" ? url(state[side]) : url;
    const b = typeof body === "function" ? body(state[side]) : body;
    const r = await call(method, u, b);
    let parsed;
    try { parsed = JSON.parse(r.text); } catch { parsed = r.text; }
    if (remember) state[side][remember] = parsed;
    pair[side] = { url: u, status: r.status, body: normalise(parsed) };
  }
  const same = pair.ref.status === pair.kernel.status && J(pair.ref.body) === J(pair.kernel.body);
  results.push({ method, url: typeof url === "function" ? url.toString() : url, same, ...(same ? { status: pair.ref.status } : pair) });
  console.log(`${same ? "same" : "DIFF"}  ${pair.ref.status}/${pair.kernel.status}  ${method} ${pair.ref.url}`);
}

const differ = results.filter((r) => !r.same).length;
writeFileSync(new URL("./fidelity.json", import.meta.url), JSON.stringify({ reference: "backend/main.py under uvicorn", steps: results.length, identical: results.length - differ, differ, results }, null, 1));
console.log(`\n${results.length - differ}/${results.length} identical after normalisation`);
process.exit(differ ? 1 : 0);
