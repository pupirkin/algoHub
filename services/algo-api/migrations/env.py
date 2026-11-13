"""Alembic environment for the `platform` schema. Version table lives in `platform.alembic_version`."""

from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine, text

from shared_kernel.settings import load_settings

SCHEMA = "platform"
config = context.config


def _url() -> str:
    url = config.get_main_option("sqlalchemy.url")
    return url or load_settings().database_url.get_secret_value()


def run_migrations_online() -> None:
    engine = create_engine(_url())
    with engine.connect() as conn:
        # The schema is also created by the compose init script; CI service containers cannot run it.
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        conn.commit()
        context.configure(
            connection=conn,
            version_table_schema=SCHEMA,
            include_schemas=False,
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    msg = "offline mode is not supported; run `just migrate` against a database"
    raise SystemExit(msg)
run_migrations_online()
