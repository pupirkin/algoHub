"""Integration tests against a real Postgres. Run: `just up && just test-int`."""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text

from shared_kernel.db import create_db_engine, create_session_factory, ping, session_scope
from shared_kernel.settings import load_settings

pytestmark = pytest.mark.integration


@pytest.fixture
def real_db(monkeypatch: pytest.MonkeyPatch) -> None:
    url = os.environ.get("ALGOHUB_TEST_DATABASE_URL")
    if not url:
        pytest.fail("ALGOHUB_TEST_DATABASE_URL is not set (integration tests need a real Postgres)")
    monkeypatch.setenv("ALGOHUB_DATABASE_URL", url)


@pytest.mark.usefixtures("real_db")
def test_ping_and_platform_schema_exists() -> None:
    engine = create_db_engine(load_settings())
    ping(engine)
    with session_scope(create_session_factory(engine)) as s:
        assert s.execute(text("SELECT version()")).scalar_one().startswith("PostgreSQL 16")
        schemas = set(s.execute(text("SELECT schema_name FROM information_schema.schemata")).scalars())
        assert "platform" in schemas
    engine.dispose()


@pytest.mark.usefixtures("real_db")
def test_session_scope_rolls_back_on_error() -> None:
    engine = create_db_engine(load_settings())
    factory = create_session_factory(engine)
    with session_scope(factory) as s:
        s.execute(text("CREATE TEMP TABLE IF NOT EXISTS t_probe (x int) ON COMMIT PRESERVE ROWS"))

    def failing_unit_of_work() -> None:
        with session_scope(factory) as s:
            s.execute(text("CREATE TABLE platform.t_rollback_probe (x int)"))
            raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        failing_unit_of_work()
    with session_scope(factory) as s:
        exists = s.execute(text("SELECT to_regclass('platform.t_rollback_probe')")).scalar_one()
        assert exists is None
    engine.dispose()
