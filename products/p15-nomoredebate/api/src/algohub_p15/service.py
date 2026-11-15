"""P15 application service: authorization by capability tokens, deadlines, and closing with a result.

Authorization matrix (TESTING_STRATEGY §3, §9):
- anyone with the room id: read public room state, join, read the result after closing;
- participant token: read/replace own ballot;
- organizer token: list participants (names + voted flag), close, delete.
A missing token -> 401 (checked first), a token that does not belong to this room/role -> 403, an unknown
room with a token -> 404 (the room id itself is the capability to see that the room exists).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from algohub_p15.domain import (
    compute_result,
    delete_after_open,
    is_expired,
    new_token,
    token_hash,
    tokens_match,
)
from algohub_p15.errors import (
    InvalidBallotError,
    InvalidTokenError,
    MissingTokenError,
    ResultNotReadyError,
    RoomNotFoundError,
)
from algohub_p15.schemas import CreateRoomRequest, name_key
from algohub_p15.store import NewParticipant, NewRoom, ParticipantRecord, ResultRecord, RoomRecord, RoomStore
from algorithms.social_choice import Method

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class Created:
    room: RoomRecord
    organizer_token: str


@dataclass(frozen=True, slots=True)
class JoinedParticipant:
    participant_id: UUID
    token: str
    display_name: str


class RoomService:
    def __init__(self, store: RoomStore, clock: Clock = utc_now) -> None:
        self._store = store
        self._clock = clock

    # ------------------------------------------------------------------ helpers
    def _room(self, room_id: UUID) -> RoomRecord:
        room = self._store.get_room(room_id)
        if room is None:
            raise RoomNotFoundError("Room not found")
        if room.status == "open" and is_expired(room.deadline_at, self._clock()):
            self._close(room.id)  # the deadline closes the room lazily, on the next request that sees it
            room = self._store.get_room(room_id)
            if room is None:  # deleted concurrently
                raise RoomNotFoundError("Room not found")
        return room

    def _organizer(self, room_id: UUID, token: str | None) -> RoomRecord:
        if token is None:
            raise MissingTokenError
        room = self._room(room_id)
        if not tokens_match(token, room.organizer_token_hash):
            raise InvalidTokenError
        return room

    def _participant(self, room_id: UUID, token: str | None) -> ParticipantRecord:
        if token is None:
            raise MissingTokenError
        self._room(room_id)
        p = self._store.find_participant(room_id, token_hash(token))
        if p is None:
            raise InvalidTokenError
        return p

    @staticmethod
    def _compute(
        room: RoomRecord, ballots: Sequence[tuple[int, ...]]
    ) -> tuple[str, int | None, dict[str, Any]]:
        payload = compute_result(room.id, len(room.options), Method(room.method), ballots)
        return payload.outcome, payload.chosen_option_id, payload.model_dump(mode="json")

    def _close(self, room_id: UUID) -> ResultRecord:
        return self._store.close_room(room_id, self._clock(), self._compute)

    # ------------------------------------------------------------------ use cases
    def create(self, req: CreateRoomRequest, organizer_token: str | None = None) -> Created:
        now = self._clock()
        token = organizer_token or new_token()
        room_id = uuid.uuid4()
        deadline = None if req.deadline_minutes is None else now + timedelta(minutes=req.deadline_minutes)
        self._store.create_room(
            NewRoom(
                id=room_id,
                question=req.question,
                method=req.method.value,
                deadline_at=deadline,
                organizer_token_hash=token_hash(token),
                max_participants=req.max_participants,
                created_at=now,
                delete_after=delete_after_open(now),
                options=tuple(req.options),
            )
        )
        return Created(room=self._room(room_id), organizer_token=token)

    def view(self, room_id: UUID) -> RoomRecord:
        return self._room(room_id)

    def join(self, room_id: UUID, display_name: str) -> JoinedParticipant:
        self._room(room_id)
        token = new_token()
        pid = uuid.uuid4()
        now = self._clock()
        self._store.add_participant(
            room_id,
            NewParticipant(pid, display_name, name_key(display_name), token_hash(token), now),
            now,
        )
        return JoinedParticipant(pid, token, display_name)

    def my_ballot(self, room_id: UUID, token: str | None) -> ParticipantRecord:
        return self._participant(room_id, token)

    def vote(self, room_id: UUID, token: str | None, ranking: Sequence[int]) -> ParticipantRecord:
        p = self._participant(room_id, token)
        room = self._room(room_id)
        if any(o >= len(room.options) for o in ranking):
            raise InvalidBallotError(
                "ranking refers to an option that is not in this room",
                details={"options": len(room.options)},
            )
        updated = self._store.put_ballot(room_id, p.id, tuple(ranking), self._clock())
        return ParticipantRecord(p.id, p.display_name, p.joined_at, tuple(ranking), updated)

    def participants(self, room_id: UUID, token: str | None) -> list[ParticipantRecord]:
        self._organizer(room_id, token)
        return self._store.list_participants(room_id)

    def close(self, room_id: UUID, token: str | None) -> tuple[RoomRecord, ResultRecord]:
        self._organizer(room_id, token)
        result = self._close(room_id)
        return self._room(room_id), result

    def result(self, room_id: UUID) -> tuple[RoomRecord, ResultRecord]:
        room = self._room(room_id)
        result = self._store.get_result(room_id)
        if result is None:
            raise ResultNotReadyError("The room is still open; the result appears when it closes")
        return room, result

    def delete(self, room_id: UUID, token: str | None) -> None:
        self._organizer(room_id, token)
        self._store.delete_room(room_id)
