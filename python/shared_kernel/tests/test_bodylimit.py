from __future__ import annotations

from collections.abc import Iterator

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import BaseModel

from shared_kernel.bodylimit import BodySizeLimitMiddleware
from shared_kernel.errors import install_error_handlers


class Payload(BaseModel):
    text: str


def _app() -> FastAPI:
    app = FastAPI()
    install_error_handlers(app)
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=100)

    @app.post("/echo")
    async def echo(request: Request) -> dict[str, int]:
        return {"n": len(await request.body())}

    @app.post("/model")
    async def model(body: Payload) -> dict[str, int]:
        return {"n": len(body.text)}

    return app


def test_small_body_passes() -> None:
    with TestClient(_app()) as c:
        r = c.post("/echo", content=b"x" * 100)
    assert r.status_code == 200
    assert r.json() == {"n": 100}


def test_declared_oversize_body_is_rejected_with_envelope() -> None:
    with TestClient(_app()) as c:
        r = c.post("/echo", content=b"x" * 101)
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"


def test_chunked_oversize_body_is_rejected_while_streaming() -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(10):
            yield b"x" * 50

    with TestClient(_app()) as c:
        raw = c.post("/echo", content=chunks())
        parsed = c.post("/model", content=chunks(), headers={"content-type": "application/json"})
    # Both a raw body read and FastAPI's own body parsing surface 413 with the error envelope (not 400).
    for r in (raw, parsed):
        assert r.status_code == 413
        assert r.json()["error"]["code"] == "payload_too_large"


def test_garbage_content_length_is_rejected() -> None:
    with TestClient(_app()) as c:
        r = c.post("/echo", content=b"x", headers={"content-length": "abc"})
    assert r.status_code in {400, 413}
