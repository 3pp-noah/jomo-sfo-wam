// Boot the in-page kernel under Node, reading the same files the page bundles.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bootKernel } from "../kernel/boot.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function kernelFiles() {
  const files = {};
  for (const rel of ["backend/main.py", "backend/research_agent.py",
                     "src/agent_registry_verified.json", "src/sfo_wam_engine.jsx"])
    files[rel] = readFileSync(join(ROOT, rel), "utf8");
  for (const p of walk(join(ROOT, "kernel/py")).filter((p) => p.endsWith(".py")))
    files[relative(ROOT, p)] = readFileSync(p, "utf8");
  return files;
}

export async function nodeKernel({ fakeClock = false } = {}) {
  const { loadPyodide } = await import(pathToFileURL(join(ROOT, "public/pyodide/pyodide.mjs")));
  const pyodide = await loadPyodide({ indexURL: join(ROOT, "public/pyodide") + "/", stdout: () => {}, stderr: (s) => process.stderr.write(s + "\n") });
  const files = kernelFiles();
  if (fakeClock) files["tests/fake_clock.py"] = readFileSync(join(ROOT, "tests/fake_clock.py"), "utf8");
  return bootKernel(pyodide, files, { prelude: fakeClock ? "from tests.fake_clock import install; install()" : "" });
}
