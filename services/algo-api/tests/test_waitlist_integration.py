"""Platform migrations + waitlist against a real Postgres. Run: `just up && just test-int`."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, create_engine, inspect, text

from algo_api.main import create_app
from algo_api.platform.waitlist import RETENTION_DAYS, SqlWaitlistStore, waitlist_table
from shared_kernel.db import create_session_factory
from shared_kernel.settings import Settings

pytestmark = pytest.mark.integration

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
URL = "/api/v1/platform/waitlist"


def _db_url() -> str:
    url = os.environ.get("ALGOHUB_TEST_DATABASE_URL")
    if not url:
        pytest.fail("ALGOHUB_TEST_DATABASE_URL is not set (integration tests need a real Postgres)")
    return url


def _alembic(url: str) -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))  # configparser interpolation
    return cfg


@pytest.fixture
def engine() -> Iterator[Engine]:
    url = _db_url()
    command.upgrade(_alembic(url), "head")
    eng = create_engine(url)
    with eng.begin() as conn:
        conn.execute(text("TRUNCATE platform.waitlist"))
    yield eng
    eng.dispose()


def test_migrations_roundtrip_upgrade_downgrade_upgrade() -> None:
    cfg = _alembic(_db_url())
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    eng = create_engine(_db_url())
    assert not inspect(eng).has_table("waitlist", schema="platform")
    command.upgrade(cfg, "head")
    assert inspect(eng).has_table("waitlist", schema="platform")
    eng.dispose()


def test_table_matches_sqlalchemy_definition(engine: Engine) -> None:
    insp = inspect(engine)
    db_cols = {c["name"]: c for c in insp.get_columns("waitlist", schema="platform")}
    assert set(db_cols) == {c.name for c in waitlist_table.columns}
    for col in waitlist_table.columns:
        assert db_cols[col.name]["nullable"] == col.nullable, col.name
        db_ddl = str(db_cols[col.name]["type"].compile(dialect=engine.dialect))
        assert db_ddl == str(col.type.compile(dialect=engine.dialect)), col.name
    # on_conflict_do_nothing(constraint=...) depends on this exact name.
    uniques = {u["name"] for u in insp.get_unique_constraints("waitlist", schema="platform")}
    assert uniques == {"uq_waitlist_product_email"}
    checks = {c["name"] for c in insp.get_check_constraints("waitlist", schema="platform")}
    model_checks = {c.name for c in waitlist_table.constraints if c.__class__.__name__ == "CheckConstraint"}
    assert checks == model_checks
    indexes = {
        i["name"]
        for i in insp.get_indexes("waitlist", schema="platform")
        if not i.get("duplicates_constraint")  # the unique constraint's own index
    }
    assert indexes == {i.name for i in waitlist_table.indexes}


def test_no_cross_schema_foreign_keys(engine: Engine) -> None:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT tc.table_schema, ccu.table_schema AS ref_schema
                FROM information_schema.table_constraints tc
                JOIN information_schema.constraint_column_usage ccu
                  ON tc.constraint_name = ccu.constraint_name AND tc.constraint_schema = ccu.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema <> ccu.table_schema
                """
            )
        ).all()
    assert rows == []


def test_signup_is_stored_once_and_normalized(engine: Engine) -> None:
    app = create_app(Settings(database_url=SecretStr(_db_url())), engine=engine, mounts=[])
    with TestClient(app) as c:
        for email in ("User@Example.com", "user@example.com"):
            r = c.post(URL, json={"product_id": "P15", "email": email})
            assert r.status_code == 202
        assert c.post(URL, json={"product_id": "P31", "email": "user@example.com"}).status_code == 202
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT product_id, email FROM platform.waitlist ORDER BY product_id")).all()
    assert [tuple(r) for r in rows] == [("P15", "user@example.com"), ("P31", "user@example.com")]


def test_database_rejects_bad_rows(engine: Engine) -> None:
    with pytest.raises(Exception, match="ck_waitlist_email_length"), engine.begin() as conn:
        conn.execute(
            text("INSERT INTO platform.waitlist (product_id, email) VALUES ('P15', :e)"), {"e": "a" * 255}
        )
    with pytest.raises(Exception, match="ck_waitlist_product_id"), engine.begin() as conn:
        conn.execute(text("INSERT INTO platform.waitlist (product_id, email) VALUES ('X1', 'a@b.com')"))


def test_purge_removes_only_rows_older_than_retention(engine: Engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO platform.waitlist (product_id, email, created_at) VALUES "
                "('P15', 'old@example.com', now() - interval '366 days'), "
                "('P15', 'new@example.com', now() - interval '364 days')"
            )
        )
    removed = SqlWaitlistStore(create_session_factory(engine)).purge_older_than(RETENTION_DAYS)
    assert removed == 1
    with engine.connect() as conn:
        left = conn.execute(text("SELECT email FROM platform.waitlist")).scalars().all()
    assert left == ["new@example.com"]
