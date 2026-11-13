"""Shared helpers for P15 tests (importable by name: see `pythonpath` in the root pyproject.toml)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, create_engine

from algo_api.main import create_app
from algo_api.products import ProductMount, p15_mount
from algohub_p15 import router as p15_router
from algohub_p15.domain import Rules
from algohub_p15.store import RoomStore
from shared_kernel.settings import Settings

API = "/api/v1/p15"
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"
SCENARIOS = Path(__file__).resolve().parents[2] / "scenarios"


@dataclass
class FakeClock:
    now: datetime = field(default_factory=lambda: datetime(2026, 11, 13, 12, 0, tzinfo=UTC))

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kw: float) -> None:
        self.now += timedelta(**kw)


def settings() -> Settings:
    return Settings(
        database_url=SecretStr("postgresql+psycopg://algohub:not-a-secret@127.0.0.1:1/none"),
        cors_origins=["http://localhost:3000"],
        log_json=True,
    )


def db_url() -> str:
    url = os.environ.get("ALGOHUB_TEST_DATABASE_URL")
    if not url:
        pytest.fail("ALGOHUB_TEST_DATABASE_URL is not set (integration tests need a real Postgres)")
    return url


def alembic_config(url: str) -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


def make_app(store: RoomStore, rules: Rules, clock: FakeClock) -> FastAPI:
    def setup(app: FastAPI, _engine: Engine) -> None:
        p15_router.install(app, store, rules=rules, clock=clock)

    mount: ProductMount = p15_mount(setup)
    unreachable = create_engine("postgresql+psycopg://x@127.0.0.1:1/x")
    return create_app(settings(), engine=unreachable, mounts=[mount])


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_room(api: TestClient, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"question": "Что заказываем?", "options": ["Pizza", "Sushi", "Burgers"]}
    body.update(overrides)
    res = api.post(f"{API}/rooms", json=body)
    assert res.status_code == 201, res.text
    data: dict[str, Any] = res.json()
    return data


def join(api: TestClient, room_id: str, name: str) -> str:
    res = api.post(f"{API}/rooms/{room_id}/participants", json={"display_name": name})
    assert res.status_code == 201, res.text
    token: str = res.json()["participant_token"]
    return token
