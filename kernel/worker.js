// The backend, running in a Web Worker so that runtime ticks never hold up the page.
//
// Messages in:  {type:"boot", pyodideURL}
//               {type:"request", id, method, url, body}
//               {type:"open-stream", sid, url} / {type:"close-stream", sid}
// Messages out: {type:"ready"} / {type:"boot-failed", error}
//               {type:"response", id, status, media_type, body}
//               {type:"stream-open", sid, status, media_type, body} / {type:"chunk", sid, text}

import { bootKernel } from "./boot.js";
import mainPy from "../backend/main.py?raw";
import researchPy from "../backend/research_agent.py?raw";
import registryJson from "../src/agent_registry_verified.json?raw";
import engineJsx from "../src/sfo_wam_engine.jsx?raw";

const kernelPy = import.meta.glob("./py/**/*.py", { query: "?raw", import: "default", eager: true });

const files = {
  "backend/main.py": mainPy,
  "backend/research_agent.py": researchPy,
  "src/agent_registry_verified.json": registryJson,
  "src/sfo_wam_engine.jsx": engineJsx,
};
for (const [path, text] of Object.entries(kernelPy)) files["kernel/" + path.slice(2)] = text;

let kernel;
let pyodide;
let ready;
let persisted = false;

// IndexedDB keeps each visitor's database and forged agents in their own browser.
async function persist(dir) {
  try {
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, dir);
    await new Promise((ok, fail) => pyodide.FS.syncfs(true, (e) => (e ? fail(e) : ok())));
    persisted = true;
  } catch (e) {
    console.warn("[kernel] storage unavailable; this session will not be kept:", e);
  }
}

let syncing = false;
let dirty = false;
function save() {
  if (!persisted) return;
  if (syncing) { dirty = true; return; }
  syncing = true;
  pyodide.FS.syncfs(false, (e) => {
    if (e) console.warn("[kernel] save failed:", e);
    syncing = false;
    if (dirty) { dirty = false; save(); }
  });
}
// The runtime loop writes on its own between requests.
setInterval(save, 5000);

async function boot(pyodideURL) {
  const { loadPyodide } = await import(/* @vite-ignore */ pyodideURL + "pyodide.mjs");
  pyodide = await loadPyodide({ indexURL: pyodideURL });
  kernel = await bootKernel(pyodide, files, { persist, prelude: "import jomo_clock" });
}

self.onmessage = async ({ data: m }) => {
  if (m.type === "boot") {
    ready = boot(m.pyodideURL);
    ready.then(
      () => self.postMessage({ type: "ready" }),
      (e) => self.postMessage({ type: "boot-failed", error: String(e && e.message || e) }),
    );
    return;
  }
  await ready;
  if (m.type === "request") {
    let r;
    try {
      r = await kernel.request(m.method, m.url, m.body);
    } catch (e) {
      console.error(e);
      r = { status: 500, media_type: "text/plain", body: "Internal Server Error" };
    }
    self.postMessage({ type: "response", id: m.id, ...r });
    if (m.method !== "GET") save();
  } else if (m.type === "open-stream") {
    const r = await kernel.openStream(m.sid, m.url, (text) => self.postMessage({ type: "chunk", sid: m.sid, text }));
    self.postMessage({ type: "stream-open", sid: m.sid, ...r });
  } else if (m.type === "close-stream") {
    kernel.closeStream(m.sid);
  }
};
