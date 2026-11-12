from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, create_engine

from algo_api.main import create_app
from shared_kernel.settings import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url=SecretStr("postgresql+psycopg://algohub:not-a-secret@127.0.0.1:1/none"),
        cors_origins=["http://localhost:3000"],
        log_json=True,
    )


@pytest.fixture
def unreachable_engine(settings: Settings) -> Engine:
    # Port 1 on localhost refuses immediately: deterministic "database down".
    return create_engine(settings.database_url.get_secret_value(), connect_args={"connect_timeout": 1})


@pytest.fixture
def client(settings: Settings, unreachable_engine: Engine) -> Iterator[TestClient]:
    with TestClient(create_app(settings, engine=unreachable_engine, mounts=[])) as c:
        yield c
