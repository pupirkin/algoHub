from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.exc import OperationalError

from algo_api.main import create_app
from algo_api.platform.waitlist import get_waitlist_store
from shared_kernel.settings import Settings

URL = "/api/v1/platform/waitlist"


class FakeStore:
    def __init__(self) -> None:
        self.rows: set[tuple[str, str]] = set()
        self.calls = 0

    def add(self, product_id: str, email: str) -> None:
        self.calls += 1
        self.rows.add((product_id, email))


class BrokenStore:
    def add(self, product_id: str, email: str) -> None:
        raise OperationalError("INSERT", {}, Exception("db down"))


@pytest.fixture
def store() -> FakeStore:
    return FakeStore()


@pytest.fixture
def api(settings: Settings, unreachable_engine: Engine, store: FakeStore) -> Iterator[TestClient]:
    app = create_app(settings, engine=unreachable_engine, mounts=[])
    app.dependency_overrides[get_waitlist_store] = lambda: store
    with TestClient(app) as c:
        yield c


def test_accepts_and_normalizes_email(api: TestClient, store: FakeStore) -> None:
    r = api.post(URL, json={"product_id": "P15", "email": "  User@Example.COM "})
    assert r.status_code == 202
    assert r.json() == {"status": "accepted"}
    assert store.rows == {("P15", "user@example.com")}


def test_repeat_signup_gets_the_same_answer_and_does_not_echo_email(api: TestClient) -> None:
    body = {"product_id": "P15", "email": "user@example.com"}
    first, second = api.post(URL, json=body), api.post(URL, json=body)
    assert first.status_code == second.status_code == 202
    assert first.json() == second.json()
    assert "user@example.com" not in second.text


@pytest.mark.parametrize(
    "body",
    [
        {"product_id": "P15", "email": "not-an-email"},
        {"product_id": "P99", "email": "user@example.com"},
        {"product_id": "p15", "email": "user@example.com"},
        {"product_id": "P15"},
        {"product_id": "P15", "email": "user@example.com", "extra": "x"},
        {"product_id": "P15", "email": f"{'a' * 250}@example.com"},
    ],
)
def test_rejects_invalid_bodies_with_error_envelope(api: TestClient, store: FakeStore, body: object) -> None:
    r = api.post(URL, json=body)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert store.calls == 0


def test_rate_limited_after_five_requests_per_minute(api: TestClient, store: FakeStore) -> None:
    codes = [
        api.post(URL, json={"product_id": "P15", "email": f"u{i}@example.com"}).status_code for i in range(6)
    ]
    assert codes == [202] * 5 + [429]
    last = api.post(URL, json={"product_id": "P15", "email": "u9@example.com"})
    assert last.json()["error"]["code"] == "rate_limited"
    retry = last.json()["error"]["details"]["retry_after_s"]
    assert retry >= 1
    assert last.headers["retry-after"] == str(retry)
    assert store.calls == 5


def test_malformed_requests_count_against_the_limit(api: TestClient, store: FakeStore) -> None:
    for _ in range(5):
        r = api.post(URL, content=b"{not json", headers={"content-type": "application/json"})
        assert r.status_code == 422
    ok_body = {"product_id": "P15", "email": "user@example.com"}
    assert api.post(URL, json=ok_body).status_code == 429
    assert store.calls == 0


def test_oversized_body_is_413_before_parsing(api: TestClient, store: FakeStore) -> None:
    r = api.post(URL, content=b"x" * (17 * 1024), headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"
    assert r.headers["x-request-id"]
    assert store.calls == 0


def test_chunked_oversized_body_is_413_too(api: TestClient, store: FakeStore) -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(20):
            yield b"x" * 1024

    r = api.post(URL, content=chunks(), headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"
    assert store.calls == 0


def test_email_that_grows_when_lowercased_is_rejected(api: TestClient, store: FakeStore) -> None:
    # «İ».lower() is two code points: 250 chars before normalizing, > 254 after.
    local = "İ" * 30 + "a" * 30
    r = api.post(URL, json={"product_id": "P15", "email": f"{local}@{'b' * 150}.com"})
    assert r.status_code == 422
    assert store.calls == 0


def test_openapi_documents_the_error_envelope(api: TestClient) -> None:
    op = api.get("/openapi.json").json()["paths"][URL]["post"]
    for code in ("413", "422", "429", "503"):
        assert op["responses"][code]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorEnvelope"
        }


def test_database_failure_is_a_503_envelope(settings: Settings, unreachable_engine: Engine) -> None:
    app = create_app(settings, engine=unreachable_engine, mounts=[])
    app.dependency_overrides[get_waitlist_store] = BrokenStore
    with TestClient(app) as c:
        r = c.post(URL, json={"product_id": "P15", "email": "user@example.com"})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "service_unavailable"


def test_unreachable_real_store_also_degrades_to_503(client: TestClient) -> None:
    r = client.post(URL, json={"product_id": "P15", "email": "user@example.com"})
    assert r.status_code == 503
    assert "not-a-secret" not in r.text


def test_cors_preflight_allows_the_portal(api: TestClient) -> None:
    r = api.options(
        URL,
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
