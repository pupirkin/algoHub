"""Wire models of ``/api/v1/p15`` (OpenAPI contract; snapshot in services/algo-api/openapi.json)."""

from __future__ import annotations

import unicodedata
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StringConstraints,
    field_validator,
)

from algorithms.social_choice import Method
from shared_kernel.provenance import Provenance

MAX_OPTIONS = 10
MAX_PARTICIPANTS_LIMIT = 50
MAX_DEADLINE_MINUTES = 7 * 24 * 60


def normalize_text(value: str) -> str:
    """NFC + collapsed inner whitespace; control characters are rejected by the caller's pattern."""
    return " ".join(unicodedata.normalize("NFC", value).split())


def name_key(value: str) -> str:
    """Comparison key for «the same name / the same option» (case- and width-insensitive)."""
    return unicodedata.normalize("NFKC", normalize_text(value)).casefold()


NO_CONTROL = r"^[^\x00-\x1f\x7f]*$"
Question = Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=NO_CONTROL)]
OptionLabel = Annotated[str, StringConstraints(min_length=1, max_length=80, pattern=NO_CONTROL)]
DisplayName = Annotated[str, StringConstraints(min_length=1, max_length=40, pattern=NO_CONTROL)]
OptionId = Annotated[StrictInt, Field(ge=0, lt=MAX_OPTIONS, description="Option position within its room")]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateRoomRequest(_In):
    question: Question
    options: Annotated[
        list[OptionLabel],
        Field(
            min_length=2,
            max_length=MAX_OPTIONS,
            json_schema_extra={"uniqueItems": True},
            description="Distinct labels (compared ignoring case, width and extra spaces).",
        ),
    ]
    method: Method = Method.CONDORCET_BORDA
    deadline_minutes: Annotated[int, Field(ge=5, le=MAX_DEADLINE_MINUTES)] | None = Field(
        default=None, description="Voting closes automatically this many minutes after creation."
    )
    max_participants: Annotated[int, Field(ge=2, le=MAX_PARTICIPANTS_LIMIT)] = 30

    @field_validator("question")
    @classmethod
    def _question(cls, v: str) -> str:
        v = normalize_text(v)
        if not v:
            msg = "question must not be blank"
            raise ValueError(msg)
        return v

    @field_validator("options")
    @classmethod
    def _options(cls, v: list[str]) -> list[str]:
        labels = [normalize_text(o) for o in v]
        if any(not label for label in labels):
            msg = "option labels must not be blank"
            raise ValueError(msg)
        if len({name_key(label) for label in labels}) != len(labels):
            msg = "option labels must be distinct"
            raise ValueError(msg)
        return labels


class JoinRequest(_In):
    display_name: DisplayName

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = normalize_text(v)
        if not v:
            msg = "display_name must not be blank"
            raise ValueError(msg)
        return v


class BallotRequest(_In):
    ranking: Annotated[
        list[OptionId],
        Field(
            min_length=1,
            max_length=MAX_OPTIONS,
            json_schema_extra={"uniqueItems": True},
            description="Distinct option ids of this room, most preferred first; unlisted share last place.",
        ),
    ]

    @field_validator("ranking")
    @classmethod
    def _distinct(cls, v: list[int]) -> list[int]:
        if len(set(v)) != len(v):
            msg = "ranking must not repeat an option"
            raise ValueError(msg)
        return v


class OptionOut(BaseModel):
    id: OptionId
    label: str


class RoomOut(BaseModel):
    """Public state of a room: no tokens, no hashes, no names, no individual ballots."""

    id: UUID
    question: str
    method: Method
    status: Literal["open", "closed"]
    deadline_at: AwareDatetime | None
    created_at: AwareDatetime
    closed_at: AwareDatetime | None
    max_participants: int
    participant_count: int
    ballot_count: int
    options: list[OptionOut]


class CreatedRoom(BaseModel):
    room: RoomOut
    organizer_token: str = Field(description="Shown once. Grants close/delete/participant list.")
    share_path: str = Field(description="Portal path participants open (no token inside).")
    organizer_path: str = Field(description="Portal path for the organizer; append '#t=<organizer_token>'.")


class Joined(BaseModel):
    participant_id: UUID
    participant_token: str = Field(description="Shown once. Grants reading and replacing own ballot.")
    display_name: str


class ParticipantOut(BaseModel):
    display_name: str
    has_voted: bool
    joined_at: AwareDatetime


class ParticipantList(BaseModel):
    participants: list[ParticipantOut]


class BallotOut(BaseModel):
    display_name: str
    ranking: list[int] | None
    updated_at: AwareDatetime | None


class ReasonOut(BaseModel):
    code: Literal[
        "no_ballots",
        "condorcet_winner",
        "no_condorcet_winner",
        "borda_top",
        "irv_majority",
        "irv_tie",
        "minimax_regret_top",
        "tie",
        "tiebreak",
    ]
    option_ids: list[int]
    value: float | None = Field(description="Borda points, IRV votes or max regret, depending on code.")
    round: int | None


class IrvRoundOut(BaseModel):
    votes: dict[str, int] = Field(description="Option id (as string) -> first-choice votes this round.")
    exhausted: int
    eliminated: int | None


class RegretOut(BaseModel):
    option_id: int
    max_regret: int
    total_regret: int


class ResultPayload(BaseModel):
    """Stored as JSONB at close time, so later algorithm changes never rewrite a past decision."""

    outcome: Literal["winner", "tie", "no_ballots"]
    winner_option_id: int | None
    tied_option_ids: list[int]
    tiebreak_option_id: int | None
    chosen_option_id: int | None = Field(description="Winner, or the tie-break pick among tied options.")
    ballot_count: int
    decided_by: Literal["condorcet", "borda", "irv", "minimax_regret"]
    condorcet_winner_option_id: int | None
    borda_points: list[float] = Field(description="Indexed by option id; unlisted options share last place.")
    pairwise_wins: list[list[int]] = Field(description="[a][b] = ballots preferring a to b.")
    irv_rounds: list[IrvRoundOut] | None
    regrets: list[RegretOut] | None
    reasons: list[ReasonOut]


class ResultOut(ResultPayload):
    room_id: UUID
    method: Method
    computed_at: datetime
    options: list[OptionOut]
    provenance: Provenance
