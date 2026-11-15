"""Condorcet, Borda, instant-runoff (IRV), minimax regret over partial rankings; ``decide`` and ``explain``.

Conventions (one place, used by every method and by the explanation):
- a ballot is a tuple of distinct option indices, most preferred first, at least one entry;
- options missing from a ballot share its last place: the voter prefers every listed option to them and has
  no preference among them;
- ``pairwise_wins[a][b]`` = number of ballots that strictly prefer ``a`` to ``b``;
- Borda points are kept doubled (integers): a listed option at position ``i`` gets ``2*(m-1-i)``, every
  unlisted option gets ``m-1-k`` (the average of the remaining positions, doubled). Equivalently,
  ``points_x2(a) = sum_b 2*wins(a,b) + ties(a,b)``;
- ties are never hidden: the outcome lists every tied option, and the deterministic tie-break pick is reported
  separately. The tie-break order is a hash of a caller-provided seed (P15: the room id), so it does not
  depend on the ballots and cannot be gamed by voting.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

Ballot = tuple[int, ...]
Outcome = Literal["winner", "tie", "no_ballots"]


class Method(StrEnum):
    CONDORCET_BORDA = "condorcet_borda"  # Condorcet winner if one exists, otherwise Borda (default)
    BORDA = "borda"
    IRV = "irv"
    MINIMAX_REGRET = "minimax_regret"


@dataclass(frozen=True, slots=True)
class Profile:
    n_options: int
    ballots: tuple[Ballot, ...]


def make_profile(n_options: int, ballots: Iterable[Sequence[int]]) -> Profile:
    """Validates and freezes the input. Raises ValueError with a readable message on bad input."""
    if isinstance(n_options, bool) or not isinstance(n_options, int) or n_options < 1:
        msg = "n_options must be a positive integer"
        raise ValueError(msg)
    frozen: list[Ballot] = []
    for i, raw in enumerate(ballots):
        ballot = tuple(raw)
        if not ballot:
            msg = f"ballot {i} is empty"
            raise ValueError(msg)
        for opt in ballot:
            if isinstance(opt, bool) or not isinstance(opt, int) or not 0 <= opt < n_options:
                msg = f"ballot {i} has an option outside 0..{n_options - 1}"
                raise ValueError(msg)
        if len(set(ballot)) != len(ballot):
            msg = f"ballot {i} lists an option twice"
            raise ValueError(msg)
        frozen.append(ballot)
    return Profile(n_options=n_options, ballots=tuple(frozen))


def pairwise_wins(profile: Profile) -> tuple[tuple[int, ...], ...]:
    m = profile.n_options
    wins = [[0] * m for _ in range(m)]
    for ballot in profile.ballots:
        listed = set(ballot)
        unlisted = [o for o in range(m) if o not in listed]
        for i, a in enumerate(ballot):
            row = wins[a]
            for b in ballot[i + 1 :]:
                row[b] += 1
            for b in unlisted:
                row[b] += 1
    return tuple(tuple(r) for r in wins)


def condorcet_winner(wins: Sequence[Sequence[int]]) -> int | None:
    """The option that beats every other one head-to-head (strict majority of expressed preferences)."""
    m = len(wins)
    for a in range(m):
        if all(wins[a][b] > wins[b][a] for b in range(m) if b != a):
            return a
    return None


def borda_points_x2(profile: Profile) -> tuple[int, ...]:
    m = profile.n_options
    points = [0] * m
    for ballot in profile.ballots:
        k = len(ballot)
        listed = set(ballot)
        for i, opt in enumerate(ballot):
            points[opt] += 2 * (m - 1 - i)
        for opt in range(m):
            if opt not in listed:
                points[opt] += m - 1 - k
    return tuple(points)


def regrets(profile: Profile) -> tuple[tuple[int, int], ...]:
    """Per option: (max regret, total regret). A voter's regret for an option = how many options they put
    strictly above it (0 = their favourite; an unlisted option is below all ``k`` listed ones -> ``k``)."""
    m = profile.n_options
    worst = [0] * m
    total = [0] * m
    for ballot in profile.ballots:
        k = len(ballot)
        pos = {opt: i for i, opt in enumerate(ballot)}
        for opt in range(m):
            r = pos.get(opt, k)
            worst[opt] = max(worst[opt], r)
            total[opt] += r
    return tuple(zip(worst, total, strict=True))


def tiebreak_order(n_options: int, seed: str) -> tuple[int, ...]:
    """Deterministic order of options for breaking ties: independent of ballots, stable across versions."""

    def key(i: int) -> str:
        return hashlib.sha256(f"{seed}:{i}".encode()).hexdigest()

    return tuple(sorted(range(n_options), key=key))


@dataclass(frozen=True, slots=True)
class IrvRound:
    counts: tuple[tuple[int, int], ...]  # (option, first-choice votes) for options still in the race
    exhausted: int  # ballots whose listed options have all been eliminated
    eliminated: int | None  # option dropped after this round (None in the final round)


def irv(profile: Profile, order: Sequence[int]) -> tuple[tuple[IrvRound, ...], tuple[int, ...]]:
    """Instant-runoff. Returns (rounds, winners). A single winner holds > 50 % of non-exhausted ballots in the
    final round; several winners mean the remaining options are exactly tied (or every ballot is exhausted).
    Among options tied for fewest votes, the one latest in ``order`` is eliminated."""
    rank_in_order = {opt: i for i, opt in enumerate(order)}
    remaining = set(range(profile.n_options))
    rounds: list[IrvRound] = []
    while True:
        counts = dict.fromkeys(remaining, 0)
        exhausted = 0
        for ballot in profile.ballots:
            top = next((o for o in ballot if o in remaining), None)
            if top is None:
                exhausted += 1
            else:
                counts[top] += 1
        active = len(profile.ballots) - exhausted
        ordered = tuple(sorted(counts.items()))
        best = max(counts.values())
        fewest = min(counts.values())
        if active == 0 or best == fewest:
            rounds.append(IrvRound(ordered, exhausted, None))
            return tuple(rounds), tuple(sorted(remaining))
        if 2 * best > active:
            rounds.append(IrvRound(ordered, exhausted, None))
            winner = next(o for o, c in ordered if c == best)
            return tuple(rounds), (winner,)
        losers = [o for o, c in counts.items() if c == fewest]
        dropped = max(losers, key=lambda o: rank_in_order[o])
        rounds.append(IrvRound(ordered, exhausted, dropped))
        remaining.discard(dropped)


@dataclass(frozen=True, slots=True)
class Decision:
    method: Method
    n_options: int
    n_ballots: int
    outcome: Outcome
    winner: int | None  # set only when outcome == "winner"
    tied: tuple[int, ...]  # set only when outcome == "tie" (ascending)
    tiebreak_pick: int | None  # first of ``tied`` in ``tiebreak_order``; set only for ties
    decided_by: Literal["condorcet", "borda", "irv", "minimax_regret"]
    condorcet_winner: int | None
    pairwise_wins: tuple[tuple[int, ...], ...]
    borda_points_x2: tuple[int, ...]
    irv_rounds: tuple[IrvRound, ...] | None  # only for Method.IRV
    regrets: tuple[tuple[int, int], ...] | None  # only for Method.MINIMAX_REGRET
    tiebreak_order: tuple[int, ...]

    @property
    def chosen(self) -> int | None:
        """The option the group goes with: the winner, or the tie-break pick among tied options."""
        return self.winner if self.winner is not None else self.tiebreak_pick


def _argmax_set(values: Sequence[int]) -> tuple[int, ...]:
    best = max(values)
    return tuple(i for i, v in enumerate(values) if v == best)


def decide(n_options: int, ballots: Iterable[Sequence[int]], method: Method, seed: str) -> Decision:
    profile = make_profile(n_options, ballots)
    method = Method(method)
    wins = pairwise_wins(profile)
    cw = condorcet_winner(wins) if profile.ballots else None
    points = borda_points_x2(profile)
    order = tiebreak_order(n_options, seed)
    irv_rounds: tuple[IrvRound, ...] | None = None
    regret_table: tuple[tuple[int, int], ...] | None = None

    top: tuple[int, ...]
    decided_by: Literal["condorcet", "borda", "irv", "minimax_regret"]
    if method is Method.CONDORCET_BORDA and cw is not None:
        top, decided_by = (cw,), "condorcet"
    elif method in (Method.CONDORCET_BORDA, Method.BORDA):
        top, decided_by = _argmax_set(points), "borda"
    elif method is Method.IRV:
        irv_rounds, top = irv(profile, order)
        decided_by = "irv"
    else:
        regret_table = regrets(profile)
        best = min(regret_table)
        top = tuple(i for i, r in enumerate(regret_table) if r == best)
        decided_by = "minimax_regret"

    outcome: Outcome
    winner: int | None
    tied: tuple[int, ...]
    pick: int | None
    if not profile.ballots:
        outcome, winner, tied, pick = "no_ballots", None, (), None
    elif len(top) == 1:
        outcome, winner, tied, pick = "winner", top[0], (), None
    else:
        outcome, winner, tied = "tie", None, tuple(sorted(top))
        pick = next(o for o in order if o in tied)
    return Decision(
        method=method,
        n_options=n_options,
        n_ballots=len(profile.ballots),
        outcome=outcome,
        winner=winner,
        tied=tied,
        tiebreak_pick=pick,
        decided_by=decided_by,
        condorcet_winner=cw,
        pairwise_wins=wins,
        borda_points_x2=points,
        irv_rounds=irv_rounds,
        regrets=regret_table,
        tiebreak_order=order,
    )


@dataclass(frozen=True, slots=True)
class Reason:
    """One step of the explanation; the UI turns ``code`` + params into text (i18n lives in the UI)."""

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
    options: tuple[int, ...] = ()
    value: int | None = None  # points x2 / votes / max regret, depending on code
    round: int | None = None  # IRV round (1-based)


def explain(d: Decision) -> tuple[Reason, ...]:
    """Why the outcome is what it is, in order. Deterministic: same Decision -> same reasons."""
    if d.outcome == "no_ballots":
        return (Reason("no_ballots"),)
    reasons: list[Reason] = []
    top = (d.winner,) if d.winner is not None else d.tied
    if d.decided_by == "condorcet":
        assert d.winner is not None  # noqa: S101 — a Condorcet winner is unique
        reasons.append(Reason("condorcet_winner", options=(d.winner,)))
    elif d.decided_by == "borda":
        if d.method is Method.CONDORCET_BORDA:
            reasons.append(Reason("no_condorcet_winner"))
        reasons.append(Reason("borda_top", options=top, value=d.borda_points_x2[top[0]]))
    elif d.decided_by == "irv":
        assert d.irv_rounds is not None  # noqa: S101
        last = d.irv_rounds[-1]
        votes = dict(last.counts)
        if d.winner is not None:
            active = d.n_ballots - last.exhausted
            reasons.append(
                Reason("irv_majority", options=(d.winner,), value=votes[d.winner], round=len(d.irv_rounds))
            )
            assert 2 * votes[d.winner] > active  # noqa: S101
        else:
            reasons.append(Reason("irv_tie", options=top, round=len(d.irv_rounds)))
    else:
        assert d.regrets is not None  # noqa: S101
        reasons.append(Reason("minimax_regret_top", options=top, value=d.regrets[top[0]][0]))
    if d.outcome == "tie":
        reasons.append(Reason("tie", options=d.tied))
        assert d.tiebreak_pick is not None  # noqa: S101
        reasons.append(Reason("tiebreak", options=(d.tiebreak_pick,)))
    return tuple(reasons)
