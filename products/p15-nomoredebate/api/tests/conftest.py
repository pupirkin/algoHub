"""Fixtures: the real algo-api app with P15 mounted over an in-memory store (unit) or Postgres (integration).

`store`/`api` are parametrized over both stores; the `sql` variant is marked `integration` and runs with
`just test-int` (needs Docker locally, runs in CI `test-py`).
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic import command
from fastapi.testclient import TestClient
from p15_testkit import FakeClock, alembic_config, db_url, make_app
from sqlalchemy import Engine, create_engine, text

from algohub_p15.domain import Rules
from algohub_p15.memory_store import InMemoryRoomStore
from algohub_p15.store import RoomStore, SqlRoomStore
from shared_kernel.db import create_session_factory


@pytest.fixture(scope="session")
def migrated_engine() -> Iterator[Engine]:
    url = db_url()
    command.upgrade(alembic_config(url), "head")
    eng = create_engine(url)
    yield eng
    eng.dispose()


def _truncate(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE p15.rooms CASCADE"))


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def rules() -> Rules:
    return Rules(
        rooms_per_ip_per_hour=1000,
        joins_per_ip_per_minute=1000,
        ballots_per_ip_per_minute=1000,
        organizer_actions_per_ip_per_minute=1000,
    )


@pytest.fixture(params=["memory", pytest.param("sql", marks=pytest.mark.integration)])
def store(request: pytest.FixtureRequest) -> RoomStore:
    if request.param == "memory":
        return InMemoryRoomStore()
    engine: Engine = request.getfixturevalue("migrated_engine")
    _truncate(engine)
    return SqlRoomStore(create_session_factory(engine))


@pytest.fixture
def api(store: RoomStore, rules: Rules, clock: FakeClock) -> Iterator[TestClient]:
    with TestClient(make_app(store, rules, clock)) as c:
        yield c
