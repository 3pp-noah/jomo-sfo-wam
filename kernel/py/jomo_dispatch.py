"""Answer the page's /api/* requests with backend/main.py's own route handlers.

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
        pattern = re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", route.path)
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
