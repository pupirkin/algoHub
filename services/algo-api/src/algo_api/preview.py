"""Local preview WITHOUT a database: `just preview` (DEVOPS_AND_WORKFLOW §1).

Mounts P15 on its in-memory store so the real UI can be exercised against the real API logic on a machine
without Docker/Postgres. Everything is lost on restart; /readyz reports the database as down — this is not
a deployment mode and is never used by compose, CI or production (those mount SqlRoomStore via products.py).
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import SecretStr
from sqlalchemy import Engine

from algo_api.main import create_app
from algo_api.products import p15_mount
from algohub_p15 import router as p15_router
from algohub_p15.memory_store import InMemoryRoomStore
from shared_kernel.errors import ConfigurationError
from shared_kernel.settings import Settings, load_settings


def _memory_p15(app: FastAPI, _engine: Engine) -> None:
    p15_router.install(app, InMemoryRoomStore())


def create_preview_app() -> FastAPI:
    try:
        settings = load_settings()
    except ConfigurationError:  # preview must start without a configured database
        settings = Settings(database_url=SecretStr("postgresql+psycopg://preview@127.0.0.1:1/none"))
    return create_app(settings, mounts=[p15_mount(_memory_p15)])
