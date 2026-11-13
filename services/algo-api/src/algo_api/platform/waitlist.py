"""«Сообщить, когда готово»: `POST /api/v1/platform/waitlist` → `platform.waitlist` (ARCHITECTURE_PLAN §6).

Privacy (CLAUDE.md rule 8):
- stores only (product_id, normalized email, created_at); no IP, no user agent, no name;
- the response is identical for new and repeated sign-ups, so the endpoint cannot be used to test whether an
  address is already on a list; the email is never echoed or logged (structlog also redacts `email`);
- retention: RETENTION_DAYS after sign-up. `just purge-waitlist` deletes older rows; scheduling it (worker,
  P31) and a deletion-on-request path are pre-deploy requirements recorded in BUILD_STATE. Nothing is mailed
  before that either.
Abuse: per-IP fixed-window rate limits checked before the body is parsed; body size limit (main.py); strict
validation (pydantic).
"""

from __future__ import annotations

from typing import Annotated, Literal, Protocol

import structlog
from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    Identity,
    Index,
    MetaData,
    Table,
    Text,
    UniqueConstraint,
    delete,
    func,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from algo_api.platform.catalog import CATALOG_PRODUCT_IDS
from shared_kernel.db import session_scope
from shared_kernel.errors import ServiceUnavailableError, error_responses
from shared_kernel.ratelimit import FixedWindowLimiter, Rule, limited_route_class

RETENTION_DAYS = 365
MAX_EMAIL_LENGTH = 254
RATE_RULES: tuple[Rule, ...] = (Rule(limit=5, window_s=60), Rule(limit=50, window_s=24 * 3600))

log = structlog.get_logger(__name__)

# Mirrors migration 0001 (services/algo-api/migrations); the integration test compares columns, types,
# nullability, constraint and index names against the migrated database.
metadata = MetaData(schema="platform")
waitlist_table = Table(
    "waitlist",
    metadata,
    Column("id", BigInteger, Identity(always=True), primary_key=True),
    Column("product_id", Text, nullable=False),
    Column("email", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    UniqueConstraint("product_id", "email", name="uq_waitlist_product_email"),
    CheckConstraint("product_id ~ '^P[0-9]{2}$'", name="ck_waitlist_product_id"),
    CheckConstraint("char_length(email) <= 254", name="ck_waitlist_email_length"),
    Index("ix_waitlist_created_at", "created_at"),
)


class WaitlistRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    product_id: Annotated[str, Field(pattern=r"^P\d{2}$", examples=["P15"])]
    email: Annotated[EmailStr, Field(max_length=MAX_EMAIL_LENGTH)]

    @field_validator("product_id")
    @classmethod
    def _known_product(cls, v: str) -> str:
        if v not in CATALOG_PRODUCT_IDS:
            msg = "unknown product id"
            raise ValueError(msg)
        return v

    @field_validator("email")
    @classmethod
    def _normalize(cls, v: str) -> str:
        # Lowercasing can lengthen some Unicode strings (e.g. «İ»): re-check the limit after normalizing.
        normalized = v.lower()
        if len(normalized) > MAX_EMAIL_LENGTH:
            msg = f"email must be at most {MAX_EMAIL_LENGTH} characters"
            raise ValueError(msg)
        return normalized


class WaitlistAccepted(BaseModel):
    status: Literal["accepted"] = "accepted"


class WaitlistStore(Protocol):
    def add(self, product_id: str, email: str) -> None:
        """Idempotent: a repeated (product_id, email) is silently ignored."""


class SqlWaitlistStore:
    def __init__(self, factory: sessionmaker[Session]) -> None:
        self._factory = factory

    def add(self, product_id: str, email: str) -> None:
        stmt = (
            insert(waitlist_table)
            .values(product_id=product_id, email=email)
            .on_conflict_do_nothing(constraint="uq_waitlist_product_email")
        )
        with session_scope(self._factory) as session:
            session.execute(stmt)

    def purge_older_than(self, days: int = RETENTION_DAYS) -> int:
        """Deletes sign-ups older than ``days``; returns the number of rows removed."""
        cutoff = func.now() - func.make_interval(0, 0, 0, days)  # (years, months, weeks, days)
        stmt = delete(waitlist_table).where(waitlist_table.c.created_at < cutoff)
        with session_scope(self._factory) as session:
            return len(session.execute(stmt.returning(waitlist_table.c.id)).all())


def get_waitlist_store(request: Request) -> WaitlistStore:
    store: WaitlistStore = request.app.state.waitlist_store
    return store


def _limiters(request: Request) -> list[FixedWindowLimiter]:
    limiters: list[FixedWindowLimiter] = request.app.state.waitlist_limiters
    return limiters


def new_limiters() -> list[FixedWindowLimiter]:
    return [FixedWindowLimiter(rule) for rule in RATE_RULES]


router = APIRouter(prefix="/api/v1/platform", tags=["platform"], route_class=limited_route_class(_limiters))


@router.post(
    "/waitlist",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=WaitlistAccepted,
    summary="Subscribe an email to the launch notice of a catalog product",
    responses=error_responses(413, 422, 429, 503),
)
def join_waitlist(
    body: WaitlistRequest, store: Annotated[WaitlistStore, Depends(get_waitlist_store)]
) -> WaitlistAccepted:
    try:
        store.add(body.product_id, body.email)
    except SQLAlchemyError as exc:
        log.warning("waitlist_store_failed", error_type=type(exc).__name__)
        raise ServiceUnavailableError("Waitlist is temporarily unavailable") from None
    log.info("waitlist_joined", product_id=body.product_id)
    return WaitlistAccepted()
