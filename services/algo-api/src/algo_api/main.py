"""FastAPI application factory. Run: `uvicorn algo_api.main:create_app --factory`."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine

from algo_api.products import ProductMount, product_mounts
from shared_kernel.db import create_db_engine, ping
from shared_kernel.errors import install_error_handlers
from shared_kernel.health import ReadinessCheck, build_health_router
from shared_kernel.logging import RequestContextMiddleware, configure_logging
from shared_kernel.settings import Settings, get_settings

API_TITLE = "AlgoHub API"


def create_app(
    settings: Settings | None = None,
    *,
    engine: Engine | None = None,
    mounts: list[ProductMount] | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(level=settings.log_level, json=settings.log_json)
    db_engine = engine or create_db_engine(settings)  # lazy: no connection until first use
    log = structlog.get_logger("algo_api")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        log.info("startup", env=settings.env.value, version=settings.version)
        yield
        db_engine.dispose()
        log.info("shutdown")

    app = FastAPI(title=API_TITLE, version=settings.version, lifespan=lifespan)
    # Last added = outermost. CORS wraps RequestContextMiddleware, so even the 500 envelope produced there
    # carries CORS headers and the request id.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    install_error_handlers(app)

    checks = [ReadinessCheck("database", lambda: ping(db_engine))]
    app.include_router(
        build_health_router(service=settings.service_name, version=settings.version, checks=checks)
    )
    for mount in mounts if mounts is not None else product_mounts():
        app.include_router(mount.router, prefix=mount.prefix)
    return app
