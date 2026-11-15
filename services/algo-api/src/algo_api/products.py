"""Registry of product API packages mounted by algo-api.

This is the ONLY module allowed to import product packages (`algohub_pXX`). Each entry names the Postgres
schema the product owns; the schema itself is created by the product's own first Alembic migration
(ADR-0005), not by the compose init script. Products are added here by their own slice.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import APIRouter, FastAPI
from sqlalchemy import Engine

import algohub_p15
from algohub_p15 import router as p15_router
from algohub_p15.memory_store import InMemoryRoomStore
from algohub_p15.store import SqlRoomStore
from shared_kernel.db import create_session_factory

# setup(app, engine): wires the product's stores/limiters into app.state before requests are served.
Setup = Callable[[FastAPI, Engine], None]


@dataclass(frozen=True, slots=True)
class ProductMount:
    pid: str  # "p15"
    schema: str  # Postgres schema name, usually == pid
    router: APIRouter
    setup: Setup | None = None

    @property
    def prefix(self) -> str:
        return f"/api/v1/{self.pid}"


def _p15_setup(app: FastAPI, engine: Engine) -> None:
    p15_router.install(app, SqlRoomStore(create_session_factory(engine)))


def p15_mount(setup: Setup = _p15_setup) -> ProductMount:
    return ProductMount(pid=algohub_p15.PID, schema=algohub_p15.SCHEMA, router=p15_router.router, setup=setup)


def product_mounts() -> list[ProductMount]:
    return [p15_mount()]


def _p15_memory_setup(app: FastAPI, _engine: Engine) -> None:
    p15_router.install(app, InMemoryRoomStore())


def preview_mounts() -> list[ProductMount]:
    """In-memory stores for `just preview` / `just e2e-preview` only (no database; data lost on restart)."""
    return [p15_mount(_p15_memory_setup)]
