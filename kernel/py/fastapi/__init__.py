"""The part of FastAPI that backend/main.py uses, for running it inside the page.

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
