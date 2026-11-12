from __future__ import annotations

import pytest

from shared_kernel.errors import ConfigurationError
from shared_kernel.settings import Environment, load_settings


def test_defaults_and_secret_hidden() -> None:
    s = load_settings()
    assert s.env is Environment.DEV
    assert s.cors_origins == ["http://localhost:3000"]
    assert "not-a-secret" not in repr(s)
    assert "not-a-secret" not in str(s.model_dump())


def test_cors_origins_from_csv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALGOHUB_CORS_ORIGINS", "http://a.test, http://b.test")
    assert load_settings().cors_origins == ["http://a.test", "http://b.test"]


@pytest.mark.parametrize(
    ("var", "value", "expected_fragment"),
    [
        ("ALGOHUB_DATABASE_URL", "sqlite:///x.db", "ALGOHUB_DATABASE_URL"),
        ("ALGOHUB_CORS_ORIGINS", "*", "ALGOHUB_CORS_ORIGINS"),
        ("ALGOHUB_LOG_LEVEL", "LOUD", "ALGOHUB_LOG_LEVEL"),
        ("ALGOHUB_ENV", "staging", "ALGOHUB_ENV"),
    ],
)
def test_invalid_config_fails_fast_with_readable_message(
    monkeypatch: pytest.MonkeyPatch, var: str, value: str, expected_fragment: str
) -> None:
    monkeypatch.setenv(var, value)
    with pytest.raises(ConfigurationError, match=expected_fragment) as exc_info:
        load_settings()
    assert "not-a-secret" not in str(exc_info.value)


def test_missing_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ALGOHUB_DATABASE_URL")
    with pytest.raises(ConfigurationError, match="ALGOHUB_DATABASE_URL"):
        load_settings()
