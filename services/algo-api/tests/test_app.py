from __future__ import annotations

from fastapi import APIRouter
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from algo_api.main import create_app
from algo_api.products import ProductMount
from shared_kernel.settings import Settings


def test_healthz(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "algo-api", "version": "0.0.0"}
    assert len(r.headers["x-request-id"]) == 32


def test_readyz_reports_db_down_as_503(client: TestClient) -> None:
    r = client.get("/readyz")
    assert r.status_code == 503
    assert r.json() == {"status": "not_ready", "checks": {"database": "fail"}}
    assert "not-a-secret" not in r.text


def test_cors_allowlist(client: TestClient) -> None:
    ok = client.get("/healthz", headers={"Origin": "http://localhost:3000"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.get("/healthz", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


def test_unknown_route_uses_error_envelope(client: TestClient) -> None:
    r = client.get("/api/v1/p00/nothing")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_product_router_mounted_under_versioned_prefix(
    settings: Settings, unreachable_engine: Engine
) -> None:
    router = APIRouter()

    @router.get("/ping")
    async def ping() -> dict[str, str]:
        return {"pong": "p99"}

    app = create_app(settings, engine=unreachable_engine, mounts=[ProductMount("p99", "p99", router)])
    with TestClient(app) as c:
        assert c.get("/api/v1/p99/ping").json() == {"pong": "p99"}


def test_unhandled_error_keeps_cors_and_request_id(settings: Settings, unreachable_engine: Engine) -> None:
    router = APIRouter()

    @router.get("/boom")
    async def boom() -> None:
        raise RuntimeError("internal detail")

    app = create_app(settings, engine=unreachable_engine, mounts=[ProductMount("p99", "p99", router)])
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get(
            "/api/v1/p99/boom", headers={"Origin": "http://localhost:3000", "X-Request-ID": "req-abcdefgh"}
        )
    assert r.status_code == 500
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert r.headers["x-request-id"] == "req-abcdefgh"
    assert r.json()["error"] == {
        "code": "internal_error",
        "message": "Internal server error",
        "request_id": "req-abcdefgh",
    }
    assert "internal detail" not in r.text
