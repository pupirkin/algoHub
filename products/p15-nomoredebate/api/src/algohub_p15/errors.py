"""P15 application errors. Subclasses of shared_kernel errors, so they map to HTTP in one place."""

from __future__ import annotations

from http import HTTPStatus

from shared_kernel.errors import AppError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError


class RoomNotFoundError(NotFoundError):
    code = "room_not_found"


class ResultNotReadyError(NotFoundError):
    code = "result_not_ready"


class RoomClosedError(ConflictError):
    code = "room_closed"


class RoomFullError(ConflictError):
    code = "room_full"


class NameTakenError(ConflictError):
    code = "name_taken"


class MissingTokenError(UnauthorizedError):
    code = "missing_token"

    def __init__(self) -> None:
        super().__init__("Bearer token required", headers={"WWW-Authenticate": "Bearer"})


class InvalidTokenError(ForbiddenError):
    code = "invalid_token"

    def __init__(self) -> None:
        super().__init__("This token does not grant access to this room")


class InvalidBallotError(AppError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_ballot"
