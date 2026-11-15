"""Request body size limit (ARCHITECTURE_PLAN §5). Pure ASGI: rejects before the body is buffered or parsed.

A declared ``Content-Length`` above the limit is answered with 413 immediately; a chunked/undeclared body is
counted while the application reads it and aborted with ``HTTPException(413)`` as soon as it crosses the limit
(FastAPI re-raises HTTPException from body parsing, so the error envelope handler answers it).
"""

from __future__ import annotations

import json

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from shared_kernel.errors import PayloadTooLargeError, error_body

DEFAULT_MAX_BODY_BYTES = 16 * 1024


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = DEFAULT_MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = next((v for k, v in scope["headers"] if k == b"content-length"), None)
        if declared is not None and (not declared.isdigit() or int(declared) > self.max_bytes):
            await self._reject(send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(413, f"Request body exceeds {self.max_bytes} bytes")
            return message

        await self.app(scope, limited_receive, send)

    async def _reject(self, send: Send) -> None:
        exc = PayloadTooLargeError(f"Request body exceeds {self.max_bytes} bytes")
        body = json.dumps(error_body(exc.code, exc.message)).encode()
        await send(
            {
                "type": "http.response.start",
                "status": int(exc.status),
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
