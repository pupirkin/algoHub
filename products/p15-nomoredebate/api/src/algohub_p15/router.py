"""HTTP layer of P15: ``/api/v1/p15`` (ARCHITECTURE_PLAN §7). Mounted by services/algo-api/products.py.

Write endpoints are rate-limited per client IP before the body is parsed (``limited_route_class``); each
limit group has its own router. Reads are not limited (clients poll every 3 s).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from algohub_p15 import PID
from algohub_p15.domain import Rules
from algohub_p15.schemas import (
    BallotOut,
    BallotRequest,
    CreatedRoom,
    CreateRoomRequest,
    Joined,
    JoinRequest,
    OptionOut,
    ParticipantList,
    ParticipantOut,
    ResultOut,
    ResultPayload,
    RoomOut,
)
from algohub_p15.service import Clock, RoomService, utc_now
from algohub_p15.store import ParticipantRecord, ResultRecord, RoomRecord, RoomStore
from shared_kernel.errors import error_responses
from shared_kernel.provenance import computed_from_user_input
from shared_kernel.ratelimit import FixedWindowLimiter, Rule, limited_route_class

PORTAL_BASE_PATH = "/p/nomoredebate"
TAGS: list[str | Enum] = [PID]


@dataclass(frozen=True, slots=True)
class P15Context:
    service: RoomService
    limiters: dict[str, list[FixedWindowLimiter]]


def new_limiters(rules: Rules) -> dict[str, list[FixedWindowLimiter]]:
    return {
        "create": [FixedWindowLimiter(Rule(rules.rooms_per_ip_per_hour, 3600))],
        "join": [FixedWindowLimiter(Rule(rules.joins_per_ip_per_minute, 60))],
        "ballot": [FixedWindowLimiter(Rule(rules.ballots_per_ip_per_minute, 60))],
        "organizer": [FixedWindowLimiter(Rule(rules.organizer_actions_per_ip_per_minute, 60))],
    }


def install(app: FastAPI, store: RoomStore, *, rules: Rules | None = None, clock: Clock = utc_now) -> None:
    app.state.p15 = P15Context(RoomService(store, clock), new_limiters(rules or Rules()))


def _ctx(request: Request) -> P15Context:
    ctx: P15Context = request.app.state.p15
    return ctx


def _group(name: str) -> Callable[[Request], Sequence[FixedWindowLimiter]]:
    return lambda request: _ctx(request).limiters[name]


def get_service(request: Request) -> RoomService:
    return _ctx(request).service


bearer = HTTPBearer(auto_error=False, description="Capability token returned when creating/joining a room.")
Service = Annotated[RoomService, Depends(get_service)]
Token = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def _token(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    return None if credentials is None else credentials.credentials


# ---------------------------------------------------------------------------- mapping
def _room_out(r: RoomRecord) -> RoomOut:
    return RoomOut(
        id=r.id,
        question=r.question,
        method=r.method,  # type: ignore[arg-type]  # validated by the DB CHECK and pydantic
        status=r.status,
        deadline_at=r.deadline_at,
        created_at=r.created_at,
        closed_at=r.closed_at,
        max_participants=r.max_participants,
        participant_count=r.participant_count,
        ballot_count=r.ballot_count,
        options=[OptionOut(id=i, label=label) for i, label in enumerate(r.options)],
    )


def _result_out(room: RoomRecord, res: ResultRecord) -> ResultOut:
    payload = ResultPayload.model_validate(res.payload)
    return ResultOut(
        **payload.model_dump(),
        room_id=room.id,
        method=res.method,  # type: ignore[arg-type]
        computed_at=res.computed_at,
        options=[OptionOut(id=i, label=label) for i, label in enumerate(room.options)],
        provenance=computed_from_user_input(res.computed_at),
    )


def _ballot_out(p: ParticipantRecord) -> BallotOut:
    return BallotOut(
        display_name=p.display_name,
        ranking=None if p.ranking is None else list(p.ranking),
        updated_at=p.ballot_updated_at,
    )


# ---------------------------------------------------------------------------- routes
reads = APIRouter(tags=TAGS)
create = APIRouter(tags=TAGS, route_class=limited_route_class(_group("create")))
join = APIRouter(tags=TAGS, route_class=limited_route_class(_group("join")))
ballot = APIRouter(tags=TAGS, route_class=limited_route_class(_group("ballot")))
organizer = APIRouter(tags=TAGS, route_class=limited_route_class(_group("organizer")))


@create.post(
    "/rooms",
    status_code=status.HTTP_201_CREATED,
    response_model=CreatedRoom,
    summary="Create a voting room; returns the organizer token once",
    responses=error_responses(400, 413, 422, 429),
)
def create_room(body: CreateRoomRequest, svc: Service) -> CreatedRoom:
    created = svc.create(body)
    rid = created.room.id
    return CreatedRoom(
        room=_room_out(created.room),
        organizer_token=created.organizer_token,
        share_path=f"{PORTAL_BASE_PATH}/r/{rid}",
        organizer_path=f"{PORTAL_BASE_PATH}/r/{rid}/admin",
    )


@reads.get(
    "/rooms/{room_id}",
    response_model=RoomOut,
    summary="Public room state (no tokens, names or individual ballots)",
    responses=error_responses(404, 422),
)
def get_room(room_id: UUID, svc: Service) -> RoomOut:
    return _room_out(svc.view(room_id))


@join.post(
    "/rooms/{room_id}/participants",
    status_code=status.HTTP_201_CREATED,
    response_model=Joined,
    summary="Join a room under a display name; returns the participant token once",
    responses=error_responses(400, 404, 409, 413, 422, 429),
)
def join_room(room_id: UUID, body: JoinRequest, svc: Service) -> Joined:
    j = svc.join(room_id, body.display_name)
    return Joined(participant_id=j.participant_id, participant_token=j.token, display_name=j.display_name)


@reads.get(
    "/rooms/{room_id}/participants",
    response_model=ParticipantList,
    summary="Organizer: who joined and who has voted (not how)",
    responses=error_responses(401, 403, 404, 422),
)
def list_participants(room_id: UUID, svc: Service, credentials: Token) -> ParticipantList:
    return ParticipantList(
        participants=[
            ParticipantOut(
                display_name=p.display_name, has_voted=p.ranking is not None, joined_at=p.joined_at
            )
            for p in svc.participants(room_id, _token(credentials))
        ]
    )


@reads.get(
    "/rooms/{room_id}/ballot",
    response_model=BallotOut,
    summary="Participant: read own ballot",
    responses=error_responses(401, 403, 404, 422),
)
def get_ballot(room_id: UUID, svc: Service, credentials: Token) -> BallotOut:
    return _ballot_out(svc.my_ballot(room_id, _token(credentials)))


@ballot.put(
    "/rooms/{room_id}/ballot",
    response_model=BallotOut,
    summary="Participant: submit or replace own ranking (idempotent; last write wins)",
    responses=error_responses(400, 401, 403, 404, 409, 413, 422, 429),
)
def put_ballot(room_id: UUID, body: BallotRequest, svc: Service, credentials: Token) -> BallotOut:
    return _ballot_out(svc.vote(room_id, _token(credentials), body.ranking))


@organizer.post(
    "/rooms/{room_id}/close",
    response_model=ResultOut,
    summary="Organizer: close voting and compute the explained result (idempotent)",
    responses=error_responses(401, 403, 404, 422, 429),
)
def close_room(room_id: UUID, svc: Service, credentials: Token) -> ResultOut:
    room, res = svc.close(room_id, _token(credentials))
    return _result_out(room, res)


@reads.get(
    "/rooms/{room_id}/result",
    response_model=ResultOut,
    summary="Result with explanation; 404 while the room is open",
    responses=error_responses(404, 422),
)
def get_result(room_id: UUID, svc: Service) -> ResultOut:
    room, res = svc.result(room_id)
    return _result_out(room, res)


@organizer.delete(
    "/rooms/{room_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Organizer: delete the room and everything in it",
    responses=error_responses(401, 403, 404, 422, 429),
)
def delete_room(room_id: UUID, svc: Service, credentials: Token) -> Response:
    svc.delete(room_id, _token(credentials))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


router = APIRouter()
for _r in (create, reads, join, ballot, organizer):
    router.include_router(_r)
