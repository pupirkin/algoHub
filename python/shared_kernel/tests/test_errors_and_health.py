from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from shared_kernel.errors import ConflictError, NotFoundError, install_error_handlers
from shared_kernel.health import ReadinessCheck, build_health_router
from shared_kernel.logging import RequestContextMiddleware


class Body(BaseModel):
    n: int


def _boom() -> None:
    raise RuntimeError("db down: password=hunter2")


def make_app(*, db_ok: bool) -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)
    install_error_handlers(app)
    checks = [ReadinessCheck("database", (lambda: None) if db_ok else _boom)]
    app.include_router(build_health_router(service="svc", version="1.2.3", checks=checks))

    @app.get("/missing")
    async def missing() -> None:
        raise NotFoundError("Room not found", details={"room_id": "r1"})

    @app.post("/conflict")
    async def conflict() -> None:
        raise ConflictError("Name taken")

    @app.post("/validate")
    async def validate(body: Body) -> Body:
        return body

    @app.get("/teapot-auth")
    async def needs_auth() -> None:
        raise HTTPException(status_code=401, detail="Missing token", headers={"WWW-Authenticate": "Bearer"})

    @app.get("/client-closed")
    async def client_closed() -> None:
        raise HTTPException(status_code=499, detail="Client closed request")

    @app.get("/crash")
    async def crash() -> None:
        raise RuntimeError("secret internals")

    return app


def test_healthz() -> None:
    r = TestClient(make_app(db_ok=False)).get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "svc", "version": "1.2.3"}


def test_readyz_ok_and_fail_without_leaking_details() -> None:
    assert TestClient(make_app(db_ok=True)).get("/readyz").json() == {
        "status": "ready",
        "checks": {"database": "ok"},
    }
    r = TestClient(make_app(db_ok=False)).get("/readyz")
    assert r.status_code == 503
    assert r.json() == {"status": "not_ready", "checks": {"database": "fail"}}
    assert "hunter2" not in r.text


def test_error_envelope_carries_request_id_from_header() -> None:
    client = TestClient(make_app(db_ok=True))
    r = client.get("/missing", headers={"X-Request-ID": "req-12345678"})
    assert r.status_code == 404
    assert r.headers["x-request-id"] == "req-12345678"
    assert r.json() == {
        "error": {
            "code": "not_found",
            "message": "Room not found",
            "details": {"room_id": "r1"},
            "request_id": "req-12345678",
        }
    }


def test_conflict_and_unknown_route() -> None:
    client = TestClient(make_app(db_ok=True))
    assert client.post("/conflict").json()["error"]["code"] == "conflict"
    r = client.get("/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    assert r.json()["error"]["request_id"] == r.headers["x-request-id"]


def test_validation_error_lists_fields() -> None:
    r = TestClient(make_app(db_ok=True)).post("/validate", json={"n": "not-int"})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error"
    assert err["details"]["fields"][0]["loc"] == ["body", "n"]


def test_unhandled_error_is_generic_500_with_request_id() -> None:
    client = TestClient(make_app(db_ok=True), raise_server_exceptions=False)
    r = client.get("/crash", headers={"X-Request-ID": "req-12345678"})
    assert r.status_code == 500
    assert r.headers["x-request-id"] == "req-12345678"
    assert r.json() == {
        "error": {"code": "internal_error", "message": "Internal server error", "request_id": "req-12345678"}
    }
    assert "secret internals" not in r.text


def test_http_exception_keeps_headers_and_nonstandard_status() -> None:
    client = TestClient(make_app(db_ok=True))
    r = client.get("/teapot-auth")
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"
    assert r.json()["error"]["code"] == "unauthorized"
    r = client.get("/client-closed")
    assert r.status_code == 499
    assert r.json()["error"]["code"] == "http_error"
