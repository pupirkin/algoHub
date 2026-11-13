"""Oracle tests (TESTING_STRATEGY §2.1): brute-force re-implementations on small inputs.

The oracles are written from the definitions, not from the optimized code: every count goes through
``prefers`` (one ballot, two options), Borda uses exact fractions of averaged positions, regret counts the
options a voter puts above, IRV recounts every round from scratch.
"""

from __future__ import annotations

from fractions import Fraction
from itertools import combinations_with_replacement, permutations

import pytest
from hypothesis import given, settings
from sc_strategies import profiles, seeds

from algorithms.social_choice import Ballot, Method, decide, tiebreak_order


def prefers(ballot: Ballot, a: int, b: int) -> bool:
    if a not in ballot:
        return False
    return b not in ballot or ballot.index(a) < ballot.index(b)


def oracle_condorcet(m: int, ballots: list[Ballot]) -> int | None:
    winners = [
        a
        for a in range(m)
        if all(
            sum(prefers(v, a, b) for v in ballots) > sum(prefers(v, b, a) for v in ballots)
            for b in range(m)
            if b != a
        )
    ]
    assert len(winners) <= 1
    return winners[0] if winners else None


def oracle_borda(m: int, ballots: list[Ballot]) -> list[Fraction]:
    points = [Fraction(0)] * m
    for v in ballots:
        k = len(v)
        rest = list(range(m - k))  # positional points left for the unlisted options: m-k-1 .. 0
        share = Fraction(sum(rest), len(rest)) if rest else Fraction(0)
        for o in range(m):
            points[o] += m - 1 - v.index(o) if o in v else share
    return points


def oracle_regret(m: int, ballots: list[Ballot]) -> list[tuple[int, int]]:
    table = []
    for a in range(m):
        per_voter = [sum(prefers(v, c, a) for c in range(m) if c != a) for v in ballots]
        table.append((max(per_voter, default=0), sum(per_voter)))
    return table


def oracle_irv(m: int, ballots: list[Ballot], order: tuple[int, ...]) -> list[int]:
    alive = list(range(m))
    while True:
        tops = [next((o for o in v if o in alive), None) for v in ballots]
        active = [t for t in tops if t is not None]
        counts = {o: active.count(o) for o in alive}
        if not active or len(set(counts.values())) == 1:
            return sorted(alive)
        leader = max(alive, key=lambda o: counts[o])
        if counts[leader] * 2 > len(active):
            return [leader]
        low = min(counts.values())
        alive.remove([o for o in order if o in alive and counts[o] == low][-1])


def oracle_top(m: int, ballots: list[Ballot], method: Method, seed: str) -> list[int]:
    if method is Method.CONDORCET_BORDA:
        cw = oracle_condorcet(m, ballots) if ballots else None
        if cw is not None:
            return [cw]
    if method in (Method.CONDORCET_BORDA, Method.BORDA):
        pts = oracle_borda(m, ballots)
        return [o for o in range(m) if pts[o] == max(pts)]
    if method is Method.IRV:
        return oracle_irv(m, ballots, tiebreak_order(m, seed))
    table = oracle_regret(m, ballots)
    return [o for o in range(m) if table[o] == min(table)]


def check_against_oracle(m: int, ballots: list[Ballot], method: Method, seed: str) -> None:
    d = decide(m, ballots, method, seed)
    assert d.condorcet_winner == (oracle_condorcet(m, ballots) if ballots else None)
    assert [Fraction(p, 2) for p in d.borda_points_x2] == oracle_borda(m, ballots)
    if d.regrets is not None:
        assert list(d.regrets) == oracle_regret(m, ballots)
    if not ballots:
        assert (d.outcome, d.winner, d.tied, d.tiebreak_pick) == ("no_ballots", None, (), None)
        return
    top = oracle_top(m, ballots, method, seed)
    if len(top) == 1:
        assert (d.outcome, d.winner, d.tied, d.tiebreak_pick) == ("winner", top[0], (), None)
    else:
        assert (d.outcome, d.winner, list(d.tied)) == ("tie", None, top)
        assert d.tiebreak_pick == next(o for o in tiebreak_order(m, seed) if o in top)


ALL_BALLOTS_3 = sorted({p[:k] for k in (1, 2, 3) for p in permutations(range(3))})


def test_all_partial_ballots_over_three_options_are_enumerated() -> None:
    assert len(ALL_BALLOTS_3) == 3 + 6 + 6


@pytest.mark.parametrize("method", list(Method))
def test_exhaustive_three_options_up_to_three_voters(method: Method) -> None:
    checked = 0
    for n in range(4):
        for prof in combinations_with_replacement(ALL_BALLOTS_3, n):
            check_against_oracle(3, list(prof), method, seed="room-oracle")
            checked += 1
    assert checked == 1 + 15 + 120 + 680


@pytest.mark.parametrize("method", list(Method))
@settings(max_examples=300, deadline=None)
@given(prof=profiles(max_options=6, max_ballots=8), seed=seeds)
def test_random_small_profiles_match_oracle(
    method: Method, prof: tuple[int, list[Ballot]], seed: str
) -> None:
    m, ballots = prof
    check_against_oracle(m, ballots, method, seed)
