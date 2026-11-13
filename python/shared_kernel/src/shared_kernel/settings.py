"""Typed configuration read from the environment (12-factor). Fails fast with a readable message."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from shared_kernel.errors import ConfigurationError


class Environment(StrEnum):
    DEV = "dev"
    TEST = "test"
    PROD = "prod"


class Settings(BaseSettings):
    """All platform settings. Env vars are prefixed with ``ALGOHUB_`` (see ``.env.example``)."""

    model_config = SettingsConfigDict(
        env_prefix="ALGOHUB_",
        extra="ignore",
        frozen=True,
        case_sensitive=False,
    )

    env: Environment = Environment.DEV
    service_name: str = "algo-api"
    version: str = "0.0.0"
    log_level: str = Field(default="INFO", pattern=r"^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")
    log_json: bool = True
    database_url: SecretStr
    db_connect_timeout_s: float = Field(default=2.0, gt=0, le=30)
    max_body_bytes: int = Field(default=16 * 1024, ge=1024, le=10 * 1024 * 1024)
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["http://localhost:3000"])

    @field_validator("database_url")
    @classmethod
    def _postgres_only(cls, v: SecretStr) -> SecretStr:
        if not v.get_secret_value().startswith("postgresql+psycopg://"):
            msg = "must start with postgresql+psycopg:// (Postgres 16 is the only supported database)"
            raise ValueError(msg)
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard(cls, v: list[str]) -> list[str]:
        if "*" in v:
            msg = "wildcard origin is not allowed; list origins explicitly"
            raise ValueError(msg)
        return v


def load_settings() -> Settings:
    """Builds Settings from the environment, converting validation errors into ConfigurationError."""
    try:
        return Settings()  # values come from the environment
    except ValidationError as exc:
        problems = "; ".join(
            f"ALGOHUB_{'_'.join(str(p) for p in e['loc']).upper()}: {e['msg']}" for e in exc.errors()
        )
        raise ConfigurationError(f"Invalid configuration — {problems}. See .env.example.") from None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()
