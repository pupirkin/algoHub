"""Domain/application errors and the single place that maps them to HTTP responses.

Wire format (RFC 9457-like): ``{"error": {"code", "message", "details"?, "request_id"}}``.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import Any, ClassVar

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from shared_kernel.request_context import current_request_id

log = structlog.get_logger(__name__)


class ConfigurationError(RuntimeError):
    """Raised at startup when required configuration is missing or invalid."""


class AppError(Exception):
    """Base class for expected, client-visible errors."""

    status: ClassVar[HTTPStatus] = HTTPStatus.BAD_REQUEST
    code: ClassVar[str] = "bad_request"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class NotFoundError(AppError):
    status = HTTPStatus.NOT_FOUND
    code = "not_found"


class UnauthorizedError(AppError):
    status = HTTPStatus.UNAUTHORIZED
    code = "unauthorized"


class ForbiddenError(AppError):
    status = HTTPStatus.FORBIDDEN
    code = "forbidden"


class ConflictError(AppError):
    status = HTTPStatus.CONFLICT
    code = "conflict"


class RateLimitedError(AppError):
    status = HTTPStatus.TOO_MANY_REQUESTS
    code = "rate_limited"


class ServiceUnavailableError(AppError):
    status = HTTPStatus.SERVICE_UNAVAILABLE
    code = "service_unavailable"


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message, "request_id": current_request_id()}
    if details:
        err["details"] = details
    return {"error": err}


def _response(status: int, body: dict[str, Any]) -> JSONResponse:
    return JSONResponse(status_code=status, content=body)


async def _app_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)  # noqa: S101 — registered only for AppError
    return _response(exc.status, error_body(exc.code, exc.message, exc.details))


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    fields = [
        {
            "loc": [str(p) for p in e.get("loc", ())],
            "msg": str(e.get("msg", "")),
            "type": str(e.get("type", "")),
        }
        for e in exc.errors()
    ]
    return _response(
        HTTPStatus.UNPROCESSABLE_ENTITY,
        error_body("validation_error", "Request validation failed", {"fields": fields}),
    )


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101
    try:
        phrase = HTTPStatus(exc.status_code).phrase
        code = phrase.lower().replace(" ", "_")
    except ValueError:  # non-standard status (e.g. 499): keep it, use a generic code
        phrase, code = "Error", "http_error"
    message = exc.detail if isinstance(exc.detail, str) else phrase
    return JSONResponse(status_code=exc.status_code, content=error_body(code, message), headers=exc.headers)


async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
    # Last resort only: RequestContextMiddleware normally answers unhandled errors (with request id + CORS).
    log.exception("unhandled_error", error_type=type(exc).__name__)
    return _response(HTTPStatus.INTERNAL_SERVER_ERROR, error_body("internal_error", "Internal server error"))


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(Exception, _unhandled)
