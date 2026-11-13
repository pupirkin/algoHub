"""P15 domain rules: tokens, retention dates and turning a social-choice Decision into the stored result."""

from __future__ import annotations

import hashlib
import secrets
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from algohub_p15.schemas import IrvRoundOut, ReasonOut, RegretOut, ResultPayload
from algorithms.social_choice import Method, decide, explain

# Retention (ARCHITECTURE_PLAN §5): a closed room lives 30 days after closing; a room that is never closed is
# deleted 30 days after creation. `python -m algohub_p15.retention` (just purge P15) deletes expired rooms.
RETENTION = timedelta(days=30)


def new_token() -> str:
    """128-bit capability token (ARCHITECTURE_PLAN §5). Only its hash is stored."""
    return secrets.token_urlsafe(16)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def tokens_match(token: str, expected_hash: str) -> bool:
    return secrets.compare_digest(token_hash(token), expected_hash)


def delete_after_open(created_at: datetime) -> datetime:
    return created_at + RETENTION


def delete_after_closed(closed_at: datetime) -> datetime:
    return closed_at + RETENTION


def is_expired(deadline_at: datetime | None, now: datetime) -> bool:
    return deadline_at is not None and deadline_at <= now


@dataclass(frozen=True, slots=True)
class Rules:
    """Abuse limits of a ROOM product (ARCHITECTURE_PLAN §5)."""

    rooms_per_ip_per_hour: int = 20
    joins_per_ip_per_minute: int = 30
    ballots_per_ip_per_minute: int = 60
    organizer_actions_per_ip_per_minute: int = 20


def compute_result(
    room_id: UUID, n_options: int, method: Method, ballots: Sequence[Sequence[int]]
) -> ResultPayload:
    """Deterministic: the tie-break seed is the room id (ARCHITECTURE_PLAN §7)."""
    d = decide(n_options, ballots, method, seed=str(room_id))
    reasons = [
        ReasonOut(
            code=r.code,
            option_ids=list(r.options),
            value=(r.value / 2 if r.code == "borda_top" else r.value) if r.value is not None else None,
            round=r.round,
        )
        for r in explain(d)
    ]
    irv_rounds = (
        [
            IrvRoundOut(
                votes={str(o): c for o, c in r.counts}, exhausted=r.exhausted, eliminated=r.eliminated
            )
            for r in d.irv_rounds
        ]
        if d.irv_rounds is not None
        else None
    )
    regrets = (
        [RegretOut(option_id=o, max_regret=w, total_regret=t) for o, (w, t) in enumerate(d.regrets)]
        if d.regrets is not None
        else None
    )
    return ResultPayload(
        outcome=d.outcome,
        winner_option_id=d.winner,
        tied_option_ids=list(d.tied),
        tiebreak_option_id=d.tiebreak_pick,
        chosen_option_id=d.chosen,
        ballot_count=d.n_ballots,
        decided_by=d.decided_by,
        condorcet_winner_option_id=d.condorcet_winner,
        borda_points=[p / 2 for p in d.borda_points_x2],
        pairwise_wins=[list(row) for row in d.pairwise_wins],
        irv_rounds=irv_rounds,
        regrets=regrets,
        reasons=reasons,
    )
