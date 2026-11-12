"""/readyz against a real Postgres. Run: `just up && just test-int`."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from algo_api.main import create_app
from shared_kernel.settings import Settings

pytestmark = pytest.mark.integration


def test_readyz_ready_with_real_database() -> None:
    url = os.environ.get("ALGOHUB_TEST_DATABASE_URL")
    if not url:
        pytest.fail("ALGOHUB_TEST_DATABASE_URL is not set (integration tests need a real Postgres)")
    with TestClient(create_app(Settings(database_url=SecretStr(url)), mounts=[])) as c:
        r = c.get("/readyz")
    assert r.status_code == 200
    assert r.json() == {"status": "ready", "checks": {"database": "ok"}}
