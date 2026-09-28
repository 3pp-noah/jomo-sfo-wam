from __future__ import annotations

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
