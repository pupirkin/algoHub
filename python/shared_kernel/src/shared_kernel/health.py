"""Liveness (/healthz) and readiness (/readyz) endpoints.

/readyz runs registered checks (database now; "migrations applied" once products have migrations).
Failure details are logged, never returned (no infrastructure leakage to the public).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

log = structlog.get_logger(__name__)

CheckFn = Callable[[], None]


@dataclass(frozen=True, slots=True)
class ReadinessCheck:
    name: str
    run: CheckFn  # raises on failure; executed in a worker thread


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str


class ReadinessResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    checks: dict[str, Literal["ok", "fail"]]


def build_health_router(*, service: str, version: str, checks: Sequence[ReadinessCheck]) -> APIRouter:
    router = APIRouter(tags=["health"])

    @router.get("/healthz", response_model=HealthResponse, summary="Liveness")
    async def healthz() -> HealthResponse:
        return HealthResponse(status="ok", service=service, version=version)

    @router.get(
        "/readyz",
        response_model=ReadinessResponse,
        summary="Readiness",
        responses={503: {"model": ReadinessResponse}},
    )
    async def readyz() -> JSONResponse:
        results: dict[str, Literal["ok", "fail"]] = {}
        for check in checks:
            try:
                await run_in_threadpool(check.run)
                results[check.name] = "ok"
            except Exception as exc:
                log.warning("readiness_check_failed", check=check.name, error_type=type(exc).__name__)
                results[check.name] = "fail"
        ready = all(v == "ok" for v in results.values())
        body = ReadinessResponse(status="ready" if ready else "not_ready", checks=results)
        return JSONResponse(status_code=200 if ready else 503, content=body.model_dump())

    return router
