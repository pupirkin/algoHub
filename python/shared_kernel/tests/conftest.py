from __future__ import annotations

from collections.abc import Iterator

import pytest

from shared_kernel.settings import get_settings

TEST_DB_URL = "postgresql+psycopg://algohub:not-a-secret@127.0.0.1:1/algohub_test"


@pytest.fixture(autouse=True)
def _isolated_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for key in ("ALGOHUB_ENV", "ALGOHUB_CORS_ORIGINS", "ALGOHUB_LOG_LEVEL", "ALGOHUB_LOG_JSON"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("ALGOHUB_DATABASE_URL", TEST_DB_URL)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
