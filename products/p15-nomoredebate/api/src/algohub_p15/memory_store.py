"""In-process RoomStore with the same semantics as SqlRoomStore, guarded by one lock.

Used by unit/contract tests and schemathesis (no Postgres needed) and by the local no-Docker preview
(`algo_api.preview`). Never wired into the production app: `products.py` mounts SqlRoomStore.
The shared contract tests run against both stores (SQL ones need `just test-int`).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from algohub_p15.domain import delete_after_closed, is_expired
from algohub_p15.errors import NameTakenError, RoomClosedError, RoomFullError, RoomNotFoundError
from algohub_p15.store import (
    ComputeResult,
    NewParticipant,
    NewRoom,
    ParticipantRecord,
    ResultRecord,
    RoomRecord,
)


@dataclass
class _Participant:
    p: NewParticipant
    ranking: tuple[int, ...] | None = None
    updated_at: datetime | None = None


@dataclass
class _Room:
    room: NewRoom
    status: str = "open"
    closed_at: datetime | None = None
    delete_after: datetime | None = None
    participants: list[_Participant] = field(default_factory=list)
    result: ResultRecord | None = None


class InMemoryRoomStore:
    def __init__(self) -> None:
        self._rooms: dict[UUID, _Room] = {}
        self._lock = threading.Lock()

    def _get(self, room_id: UUID) -> _Room:
        r = self._rooms.get(room_id)
        if r is None:
            raise RoomNotFoundError("Room not found")
        return r

    @staticmethod
    def _ensure_open(r: _Room, now: datetime) -> None:
        if r.status != "open" or is_expired(r.room.deadline_at, now):
            raise RoomClosedError("Voting in this room is closed")

    @staticmethod
    def _record(r: _Room) -> RoomRecord:
        return RoomRecord(
            id=r.room.id,
            question=r.room.question,
            method=r.room.method,
            status="closed" if r.status == "closed" else "open",
            deadline_at=r.room.deadline_at,
            organizer_token_hash=r.room.organizer_token_hash,
            max_participants=r.room.max_participants,
            created_at=r.room.created_at,
            closed_at=r.closed_at,
            options=r.room.options,
            participant_count=len(r.participants),
            ballot_count=sum(1 for p in r.participants if p.ranking is not None),
        )

    @staticmethod
    def _participant(p: _Participant) -> ParticipantRecord:
        return ParticipantRecord(p.p.id, p.p.display_name, p.p.joined_at, p.ranking, p.updated_at)

    def create_room(self, room: NewRoom) -> None:
        with self._lock:
            self._rooms[room.id] = _Room(room=room, delete_after=room.delete_after)

    def get_room(self, room_id: UUID) -> RoomRecord | None:
        with self._lock:
            r = self._rooms.get(room_id)
            return None if r is None else self._record(r)

    def add_participant(self, room_id: UUID, p: NewParticipant, now: datetime) -> None:
        with self._lock:
            r = self._get(room_id)
            self._ensure_open(r, now)
            if len(r.participants) >= r.room.max_participants:
                raise RoomFullError("This room has reached its participant limit")
            if any(x.p.name_key == p.name_key for x in r.participants):
                raise NameTakenError("This name is already taken in this room")
            r.participants.append(_Participant(p))

    def find_participant(self, room_id: UUID, token_hash: str) -> ParticipantRecord | None:
        with self._lock:
            r = self._rooms.get(room_id)
            if r is None:
                return None
            hit = next((x for x in r.participants if x.p.token_hash == token_hash), None)
            return None if hit is None else self._participant(hit)

    def put_ballot(
        self, room_id: UUID, participant_id: UUID, ranking: tuple[int, ...], now: datetime
    ) -> datetime:
        with self._lock:
            r = self._get(room_id)
            self._ensure_open(r, now)
            hit = next(x for x in r.participants if x.p.id == participant_id)
            hit.ranking, hit.updated_at = ranking, now
            return now

    def list_participants(self, room_id: UUID) -> list[ParticipantRecord]:
        with self._lock:
            r = self._rooms.get(room_id)
            if r is None:
                return []
            ordered = sorted(r.participants, key=lambda x: (x.p.joined_at, x.p.id))
            return [self._participant(x) for x in ordered]

    def close_room(self, room_id: UUID, now: datetime, compute: ComputeResult) -> ResultRecord:
        with self._lock:
            r = self._get(room_id)
            if r.result is not None:
                return r.result
            ballots = [
                x.ranking for x in sorted(r.participants, key=lambda x: x.p.id) if x.ranking is not None
            ]
            _, _, payload = compute(self._record(r), ballots)
            r.result = ResultRecord(now, r.room.method, payload)
            r.status, r.closed_at, r.delete_after = "closed", now, delete_after_closed(now)
            return r.result

    def get_result(self, room_id: UUID) -> ResultRecord | None:
        with self._lock:
            r = self._rooms.get(room_id)
            return None if r is None else r.result

    def delete_room(self, room_id: UUID) -> bool:
        with self._lock:
            return self._rooms.pop(room_id, None) is not None

    def purge_expired(self, now: datetime) -> int:
        with self._lock:
            expired = [
                k for k, r in self._rooms.items() if r.delete_after is not None and r.delete_after < now
            ]
            for k in expired:
                del self._rooms[k]
            return len(expired)
