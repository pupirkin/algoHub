"""structlog JSON logging with request ids and PII/token redaction.

Logs never contain request bodies. Fields listed in ``REDACTED_KEYS`` are replaced at any depth.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from collections.abc import Mapping, MutableMapping
from typing import Any

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from shared_kernel.errors import error_body
from shared_kernel.request_context import accept_or_generate, reset_request_id, set_request_id

REDACTED = "[REDACTED]"
REDACTED_KEYS: frozenset[str] = frozenset(
    {
        "email",
        "display_name",
        "name",
        "phone",
        "lat",
        "lng",
        "lon",
        "latitude",
        "longitude",
        "token",
        "access_token",
        "organizer_token",
        "participant_token",
        "authorization",
        "password",
        "secret",
        "cookie",
        "database_url",
    },
)


def _redact(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {k: (REDACTED if str(k).lower() in REDACTED_KEYS else _redact(v)) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_redact(v) for v in value]
    return value


def redact_processor(_: Any, __: str, event_dict: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    for key in list(event_dict):
        if key.lower() in REDACTED_KEYS:
            event_dict[key] = REDACTED
        else:
            event_dict[key] = _redact(event_dict[key])
    return event_dict


def configure_logging(*, level: str = "INFO", json: bool = True) -> None:
    """Idempotent. Call once at process start (composition root)."""
    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer() if json else structlog.dev.ConsoleRenderer(colors=False)
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.format_exc_info,
            redact_processor,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelNamesMapping()[level]),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=False,
    )


class RequestContextMiddleware:
    """Pure-ASGI middleware: request id in/out, contextvars binding, one access log line per request."""

    header = b"x-request-id"

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.log = structlog.get_logger("access")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = next((v.decode("latin-1") for k, v in scope["headers"] if k == self.header), None)
        request_id = accept_or_generate(incoming)
        token = set_request_id(request_id)
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        status = 500
        response_started = False

        async def send_with_id(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status = int(message["status"])
                response_started = True
                message.setdefault("headers", [])
                message["headers"].append((self.header, request_id.encode("latin-1")))
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception as exc:
            # Unhandled errors are answered HERE (inside CORS, with the request id bound), not by Starlette's
            # outermost ServerErrorMiddleware, which would lose both the request id and CORS headers.
            self.log.exception("unhandled_error", error_type=type(exc).__name__)
            if response_started:
                raise
            body = json.dumps(error_body("internal_error", "Internal server error")).encode()
            await send_with_id(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ],
                }
            )
            await send_with_id({"type": "http.response.body", "body": body})
        finally:
            # Path only — never query strings or bodies (they may carry tokens/PII).
            self.log.info(
                "request",
                method=scope.get("method"),
                path=scope.get("path"),
                status=status,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
            )
            structlog.contextvars.unbind_contextvars("request_id")
            reset_request_id(token)
