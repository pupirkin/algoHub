"""Database engine/session factory. One Postgres, one schema per product (ADR-0005)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from shared_kernel.settings import Settings


def create_db_engine(settings: Settings) -> Engine:
    return create_engine(
        settings.database_url.get_secret_value(),
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"connect_timeout": max(1, int(settings.db_connect_timeout_s))},
    )


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """Unit of work: commit on success, rollback on error."""
    session = factory()
    try:
        yield session
        session.commit()
    except BaseException:
        session.rollback()
        raise
    finally:
        session.close()


def ping(engine: Engine) -> None:
    """Raises if the database is unreachable."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
