"""Persistence port of P15 and its Postgres implementation (schema ``p15``).

Every method is one atomic unit of work. Concurrency rules (TESTING_STRATEGY §9, ROOM):
- joining locks the room row (``FOR UPDATE``): the participant cap and the open check hold under races;
- writing a ballot takes ``FOR SHARE`` on the room and upserts: concurrent PUTs -> the last one wins, no 500;
- closing locks the room (``FOR UPDATE``): no ballot slips in between reading ballots and storing the result.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, Protocol
from uuid import UUID

from sqlalchemy import Row, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from algohub_p15 import tables as t
from algohub_p15.domain import delete_after_closed, is_expired
from algohub_p15.errors import NameTakenError, RoomClosedError, RoomFullError, RoomNotFoundError
from shared_kernel.db import session_scope

RoomStatus = Literal["open", "closed"]


@dataclass(frozen=True, slots=True)
class NewRoom:
    id: UUID
    question: str
    method: str
    deadline_at: datetime | None
    organizer_token_hash: str
    max_participants: int
    created_at: datetime
    delete_after: datetime
    options: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RoomRecord:
    id: UUID
    question: str
    method: str
    status: RoomStatus
    deadline_at: datetime | None
    organizer_token_hash: str
    max_participants: int
    created_at: datetime
    closed_at: datetime | None
    options: tuple[str, ...]
    participant_count: int
    ballot_count: int


@dataclass(frozen=True, slots=True)
class ParticipantRecord:
    id: UUID
    display_name: str
    joined_at: datetime
    ranking: tuple[int, ...] | None
    ballot_updated_at: datetime | None


@dataclass(frozen=True, slots=True)
class NewParticipant:
    id: UUID
    display_name: str
    name_key: str
    token_hash: str
    joined_at: datetime


@dataclass(frozen=True, slots=True)
class ResultRecord:
    computed_at: datetime
    method: str
    payload: dict[str, Any]


# compute(room, ballots) -> (outcome, chosen option, payload). Pure; called inside the closing transaction.
ComputeResult = Callable[[RoomRecord, Sequence[tuple[int, ...]]], tuple[str, int | None, dict[str, Any]]]


class RoomStore(Protocol):
    def create_room(self, room: NewRoom) -> None: ...
    def get_room(self, room_id: UUID) -> RoomRecord | None: ...
    def add_participant(self, room_id: UUID, p: NewParticipant, now: datetime) -> None:
        """Raises RoomNotFound, RoomClosed (closed or past deadline), RoomFull, NameTaken."""

    def find_participant(self, room_id: UUID, token_hash: str) -> ParticipantRecord | None: ...
    def put_ballot(
        self, room_id: UUID, participant_id: UUID, ranking: tuple[int, ...], now: datetime
    ) -> datetime:
        """Upserts; returns updated_at. Raises RoomNotFound, RoomClosed (closed or past deadline)."""

    def list_participants(self, room_id: UUID) -> list[ParticipantRecord]: ...
    def close_room(self, room_id: UUID, now: datetime, compute: ComputeResult) -> ResultRecord:
        """Idempotent: an already closed room returns its stored result. Raises RoomNotFound."""

    def get_result(self, room_id: UUID) -> ResultRecord | None: ...
    def delete_room(self, room_id: UUID) -> bool: ...
    def purge_expired(self, now: datetime) -> int: ...


class SqlRoomStore:
    def __init__(self, factory: sessionmaker[Session]) -> None:
        self._factory = factory

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _room_row(
        s: Session, room_id: UUID, lock: Literal["update", "share"] | None = None
    ) -> Row[Any] | None:
        stmt = select(t.rooms).where(t.rooms.c.id == room_id)
        if lock == "update":
            stmt = stmt.with_for_update()
        elif lock == "share":
            stmt = stmt.with_for_update(read=True)
        return s.execute(stmt).one_or_none()

    @staticmethod
    def _record(s: Session, row: Row[Any]) -> RoomRecord:
        labels = s.scalars(
            select(t.options.c.label).where(t.options.c.room_id == row.id).order_by(t.options.c.position)
        ).all()
        participants = s.scalar(
            select(func.count()).select_from(t.participants).where(t.participants.c.room_id == row.id)
        )
        ballots = s.scalar(select(func.count()).select_from(t.ballots).where(t.ballots.c.room_id == row.id))
        return RoomRecord(
            id=row.id,
            question=row.question,
            method=row.method,
            status=row.status,
            deadline_at=row.deadline_at,
            organizer_token_hash=row.organizer_token_hash,
            max_participants=row.max_participants,
            created_at=row.created_at,
            closed_at=row.closed_at,
            options=tuple(labels),
            participant_count=participants or 0,
            ballot_count=ballots or 0,
        )

    @staticmethod
    def _ensure_open(row: Row[Any], now: datetime) -> None:
        if row.status != "open" or is_expired(row.deadline_at, now):
            raise RoomClosedError("Voting in this room is closed")

    # ------------------------------------------------------------------ port
    def create_room(self, room: NewRoom) -> None:
        with session_scope(self._factory) as s:
            s.execute(
                t.rooms.insert().values(
                    id=room.id,
                    question=room.question,
                    method=room.method,
                    status="open",
                    deadline_at=room.deadline_at,
                    organizer_token_hash=room.organizer_token_hash,
                    max_participants=room.max_participants,
                    created_at=room.created_at,
                    closed_at=None,
                    delete_after=room.delete_after,
                )
            )
            s.execute(
                t.options.insert(),
                [{"room_id": room.id, "position": i, "label": lbl} for i, lbl in enumerate(room.options)],
            )

    def get_room(self, room_id: UUID) -> RoomRecord | None:
        with session_scope(self._factory) as s:
            row = self._room_row(s, room_id)
            return None if row is None else self._record(s, row)

    def add_participant(self, room_id: UUID, p: NewParticipant, now: datetime) -> None:
        with session_scope(self._factory) as s:
            row = self._room_row(s, room_id, lock="update")
            if row is None:
                raise RoomNotFoundError("Room not found")
            self._ensure_open(row, now)
            count = s.scalar(
                select(func.count()).select_from(t.participants).where(t.participants.c.room_id == room_id)
            )
            if (count or 0) >= row.max_participants:
                raise RoomFullError("This room has reached its participant limit")
            taken = s.scalar(
                select(t.participants.c.id).where(
                    t.participants.c.room_id == room_id, t.participants.c.name_key == p.name_key
                )
            )
            if taken is not None:
                raise NameTakenError("This name is already taken in this room")
            try:
                with s.begin_nested():
                    s.execute(
                        t.participants.insert().values(
                            id=p.id,
                            room_id=room_id,
                            display_name=p.display_name,
                            name_key=p.name_key,
                            token_hash=p.token_hash,
                            joined_at=p.joined_at,
                        )
                    )
            except IntegrityError:  # lost a race on the unique name despite the room lock (defensive)
                raise NameTakenError("This name is already taken in this room") from None

    def find_participant(self, room_id: UUID, token_hash: str) -> ParticipantRecord | None:
        with session_scope(self._factory) as s:
            row = s.execute(
                select(
                    t.participants.c.id,
                    t.participants.c.display_name,
                    t.participants.c.joined_at,
                    t.ballots.c.ranking,
                    t.ballots.c.updated_at,
                )
                .outerjoin(t.ballots, t.ballots.c.participant_id == t.participants.c.id)
                .where(t.participants.c.room_id == room_id, t.participants.c.token_hash == token_hash)
            ).one_or_none()
            if row is None:
                return None
            return ParticipantRecord(
                id=row.id,
                display_name=row.display_name,
                joined_at=row.joined_at,
                ranking=None if row.ranking is None else tuple(row.ranking),
                ballot_updated_at=row.updated_at,
            )

    def put_ballot(
        self, room_id: UUID, participant_id: UUID, ranking: tuple[int, ...], now: datetime
    ) -> datetime:
        with session_scope(self._factory) as s:
            row = self._room_row(s, room_id, lock="share")
            if row is None:
                raise RoomNotFoundError("Room not found")
            self._ensure_open(row, now)
            stmt = insert(t.ballots).values(
                participant_id=participant_id, room_id=room_id, ranking=list(ranking), updated_at=now
            )
            s.execute(
                stmt.on_conflict_do_update(
                    index_elements=[t.ballots.c.participant_id],
                    set_={"ranking": stmt.excluded.ranking, "updated_at": stmt.excluded.updated_at},
                )
            )
            return now

    def list_participants(self, room_id: UUID) -> list[ParticipantRecord]:
        with session_scope(self._factory) as s:
            rows = s.execute(
                select(
                    t.participants.c.id,
                    t.participants.c.display_name,
                    t.participants.c.joined_at,
                    t.ballots.c.ranking,
                    t.ballots.c.updated_at,
                )
                .outerjoin(t.ballots, t.ballots.c.participant_id == t.participants.c.id)
                .where(t.participants.c.room_id == room_id)
                .order_by(t.participants.c.joined_at, t.participants.c.id)
            ).all()
            return [
                ParticipantRecord(
                    id=r.id,
                    display_name=r.display_name,
                    joined_at=r.joined_at,
                    ranking=None if r.ranking is None else tuple(r.ranking),
                    ballot_updated_at=r.updated_at,
                )
                for r in rows
            ]

    def close_room(self, room_id: UUID, now: datetime, compute: ComputeResult) -> ResultRecord:
        with session_scope(self._factory) as s:
            row = self._room_row(s, room_id, lock="update")
            if row is None:
                raise RoomNotFoundError("Room not found")
            if row.status == "closed":
                stored = s.execute(select(t.results).where(t.results.c.room_id == room_id)).one()
                return ResultRecord(stored.computed_at, stored.method, stored.payload)
            record = self._record(s, row)
            ballots = [
                tuple(r)
                for r in s.scalars(
                    select(t.ballots.c.ranking)
                    .where(t.ballots.c.room_id == room_id)
                    .order_by(t.ballots.c.participant_id)
                ).all()
            ]
            outcome, chosen, payload = compute(record, ballots)
            s.execute(
                t.results.insert().values(
                    room_id=room_id,
                    computed_at=now,
                    method=row.method,
                    outcome=outcome,
                    chosen_position=chosen,
                    payload=payload,
                )
            )
            s.execute(
                update(t.rooms)
                .where(t.rooms.c.id == room_id)
                .values(status="closed", closed_at=now, delete_after=delete_after_closed(now))
            )
            return ResultRecord(now, row.method, payload)

    def get_result(self, room_id: UUID) -> ResultRecord | None:
        with session_scope(self._factory) as s:
            row = s.execute(select(t.results).where(t.results.c.room_id == room_id)).one_or_none()
            return None if row is None else ResultRecord(row.computed_at, row.method, row.payload)

    def delete_room(self, room_id: UUID) -> bool:
        with session_scope(self._factory) as s:
            return (
                s.execute(delete(t.rooms).where(t.rooms.c.id == room_id).returning(t.rooms.c.id)).first()
                is not None
            )

    def purge_expired(self, now: datetime) -> int:
        with session_scope(self._factory) as s:
            return len(
                s.execute(delete(t.rooms).where(t.rooms.c.delete_after < now).returning(t.rooms.c.id)).all()
            )
