"""Request-scoped context (request id) shared by logging and error responses."""

from __future__ import annotations

import re
import uuid
from contextvars import ContextVar

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)

# Accept client ids only if short and boring; anything else is replaced (log-injection safety).
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,128}$")


def current_request_id() -> str | None:
    return _request_id.get()


def set_request_id(value: str | None) -> object:
    return _request_id.set(value)


def reset_request_id(token: object) -> None:
    _request_id.reset(token)  # type: ignore[arg-type]


def accept_or_generate(incoming: str | None) -> str:
    if incoming is not None and _VALID_REQUEST_ID.fullmatch(incoming):
        return incoming
    return uuid.uuid4().hex
