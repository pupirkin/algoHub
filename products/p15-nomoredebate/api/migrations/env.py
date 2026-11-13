"""Alembic environment for schema `p15`. Version table lives in `p15.alembic_version` (ADR-0005)."""

from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine, text

from shared_kernel.settings import load_settings

SCHEMA = "p15"
config = context.config


def _url() -> str:
    url = config.get_main_option("sqlalchemy.url")
    return url or load_settings().database_url.get_secret_value()


def run_migrations_online() -> None:
    engine = create_engine(_url())
    with engine.connect() as conn:
        # The product owns its schema: created here, before the version table that lives inside it.
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
