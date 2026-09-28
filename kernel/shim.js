// Route the page's /api/* requests to the backend running in kernel/worker.js.
//
// The dashboard calls fetch("/api/...") and new EventSource("/api/runtime/stream") exactly as
// it did against uvicorn; both are answered here, in the browser, by backend/main.py itself.
// Everything else goes to the network unchanged.

const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

const pending = new Map();
const streams = new Map();
let nextId = 1;

const badge = document.createElement("div");
badge.setAttribute("role", "status");
badge.style.cssText =
  "position:fixed;right:12px;bottom:12px;z-index:9999;max-width:calc(100vw - 24px);padding:6px 10px;" +
  "border-radius:6px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;" +
  "background:#0b0b0b;color:#f9f9f7;opacity:.9;pointer-events:none";
badge.textContent = "Starting the causal kernel in this browser…";
const showBadge = () => document.body && !badge.isConnected && document.body.appendChild(badge);
if (document.body) showBadge(); else addEventListener("DOMContentLoaded", showBadge);

let resolveReady, rejectReady;
const ready = new Promise((ok, fail) => { resolveReady = ok; rejectReady = fail; });
ready.catch(() => {});

worker.onmessage = ({ data: m }) => {
  if (m.type === "ready") {
    badge.remove();
    resolveReady();
  } else if (m.type === "boot-failed") {
    badge.textContent = "The causal kernel could not start in this browser: " + m.error;
    rejectReady(new Error(m.error));
  } else if (m.type === "response") {
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  } else if (m.type === "stream-open") {
    streams.get(m.sid)?._opened(m);
  } else if (m.type === "chunk") {
    streams.get(m.sid)?._chunk(m.text);
  }
};
worker.postMessage({ type: "boot", pyodideURL: new URL("pyodide/", document.baseURI).href });

function apiPath(input) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(raw, location.href);
  if (u.origin !== location.origin || !u.pathname.startsWith("/api/")) return null;
  return u.pathname + u.search;
}

const networkFetch = window.fetch.bind(window);

window.fetch = async function fetch(input, init = {}) {
  const url = apiPath(input);
  if (url === null) return networkFetch(input, init);
  const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  let body = init.body ?? null;
  if (body === null && input instanceof Request && method !== "GET") body = await input.text();
  if (body !== null && typeof body !== "string") body = await new Response(body).text();
  await ready;
  const id = nextId++;
  const m = await new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ type: "request", id, method, url, body });
  });
  return new Response(m.body, { status: m.status, headers: { "content-type": m.media_type } });
};

const NetworkEventSource = window.EventSource;

class KernelEventSource extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  constructor(url) {
    super();
    this.url = new URL(url, location.href).href;
    this.readyState = 0;
    this.withCredentials = false;
    this.onopen = this.onmessage = this.onerror = null;
    this._sid = nextId++;
    this._buffer = "";
    streams.set(this._sid, this);
    ready.then(
      () => worker.postMessage({ type: "open-stream", sid: this._sid, url: apiPath(url) }),
      () => this._fail(),
    );
  }

  _emit(type, event) {
    this.dispatchEvent(event);
    const handler = this["on" + type];
    if (typeof handler === "function") handler.call(this, event);
  }

  _fail() {
    this.readyState = 2;
    streams.delete(this._sid);
    this._emit("error", new Event("error"));
  }

  _opened(m) {
    if (this.readyState === 2) return;
    if (m.status !== 200) return this._fail();
    this.readyState = 1;
    this._emit("open", new Event("open"));
  }

  // Server-sent events: blocks separated by a blank line, "data:" lines joined by newlines.
  _chunk(text) {
    if (this.readyState === 2) return;
    this._buffer += text;
    let cut;
    while ((cut = this._buffer.indexOf("\n\n")) !== -1) {
      const block = this._buffer.slice(0, cut);
      this._buffer = this._buffer.slice(cut + 2);
      let type = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        else if (line.startsWith("event:")) type = line.slice(6).trim();
      }
      if (data.length) this._emit(type, new MessageEvent(type, { data: data.join("\n"), origin: location.origin }));
    }
  }

  close() {
    if (this.readyState === 2) return;
    this.readyState = 2;
    streams.delete(this._sid);
    worker.postMessage({ type: "close-stream", sid: this._sid });
  }
}

window.EventSource = function EventSource(url, options) {
  return apiPath(url) === null ? new NetworkEventSource(url, options) : new KernelEventSource(url);
};
Object.assign(window.EventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2, prototype: KernelEventSource.prototype });
