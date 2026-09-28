// Start backend/main.py inside Pyodide. Shared by the page's worker and the fidelity test.
//
// files: { "<path under /app>": "<text>" } — the backend, its two data inputs
// (src/agent_registry_verified.json, src/sfo_wam_engine.jsx) and kernel/py.
// persist(dir) is called for each directory whose contents should survive a reload
// (the runtime database and the registry that FORGE appends to); it may mount storage
// there and must return a promise. prelude is Python run just before backend.main is imported.

export const APP = "/app";

export async function bootKernel(pyodide, files, { persist = async () => {}, prelude = "" } = {}) {
  await pyodide.loadPackage(["pydantic", "sqlite3"], { messageCallback: () => {} });
  const FS = pyodide.FS;
  const mkdirs = (dir) => {
    let cur = "";
    for (const part of dir.split("/").filter(Boolean)) {
      cur += "/" + part;
      if (!FS.analyzePath(cur).exists) FS.mkdir(cur);
    }
  };
  mkdirs(`${APP}/backend/runtime_state`);
  mkdirs(`${APP}/src`);
  await persist(`${APP}/backend/runtime_state`);
  await persist(`${APP}/src`);

  for (const [rel, text] of Object.entries(files)) {
    const path = `${APP}/${rel}`;
    mkdirs(path.slice(0, path.lastIndexOf("/")));
    // The registry grows when an agent is forged; keep the stored copy once one exists.
    if (rel === "src/agent_registry_verified.json" && FS.analyzePath(path).exists) continue;
    FS.writeFile(path, text);
  }

  await pyodide.runPythonAsync(`
import sys
sys.path[:0] = ["${APP}/kernel/py", "${APP}"]
${prelude}
import backend.main as jomo_main
import jomo_dispatch
jomo_dispatch.install(jomo_main.app)
`);
  const dispatch = pyodide.pyimport("jomo_dispatch");
  return {
    async request(method, url, bodyText) {
      return JSON.parse(await dispatch.handle(method, url, bodyText ?? null));
    },
    async openStream(id, url, onChunk) {
      return JSON.parse(await dispatch.open_stream(id, url, onChunk));
    },
    closeStream(id) {
      dispatch.close_stream(id);
    },
  };
}
