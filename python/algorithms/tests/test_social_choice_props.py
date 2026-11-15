"""Property tests (TESTING_STRATEGY §2.2): domain invariants of each voting method, not "does not crash"."""

from __future__ import annotations

from dataclasses import replace

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st
from sc_strategies import profiles, seeds

from algorithms.social_choice import Ballot, Decision, Method, decide, explain, tiebreak_order

Prof = tuple[int, list[Ballot]]
FAST = settings(max_examples=200, deadline=None)


def top_set(m: int, ballots: list[Ballot], method: Method, seed: str) -> tuple[int, ...]:
    d = decide(m, ballots, method, seed)
    return (d.winner,) if d.winner is not None else d.tied


def raise_option(ballot: Ballot, x: int) -> Ballot:
    """Moves ``x`` one place up (an unlisted ``x`` becomes the last listed option)."""
    if x not in ballot:
        return (*ballot, x)
    i = ballot.index(x)
    if i == 0:
        return ballot
    b = list(ballot)
    b[i - 1], b[i] = b[i], b[i - 1]
    return tuple(b)


@pytest.mark.parametrize("method", [Method.BORDA, Method.CONDORCET_BORDA])
@FAST
@given(prof=profiles(min_ballots=1), seed=seeds, data=st.data())
def test_monotonicity_raising_the_chosen_option_keeps_it_chosen(
    method: Method, prof: Prof, seed: str, data: st.DataObject
) -> None:
    m, ballots = prof
    before = decide(m, ballots, method, seed)
    x = before.chosen
    assert x is not None
    i = data.draw(st.integers(0, len(ballots) - 1))
    raised = [*ballots[:i], raise_option(ballots[i], x), *ballots[i + 1 :]]
    after = decide(m, raised, method, seed)
    assert after.chosen == x
    assert after.borda_points_x2[x] >= before.borda_points_x2[x]


@pytest.mark.parametrize("method", list(Method))
@FAST
@given(prof=profiles(), seed=seeds, data=st.data())
def test_neutrality_relabelling_options_relabels_the_result(
    method: Method, prof: Prof, seed: str, data: st.DataObject
) -> None:
    m, ballots = prof
    perm = data.draw(st.permutations(range(m)))
    relabelled = [tuple(perm[o] for o in b) for b in ballots]
    a = decide(m, ballots, method, seed)
    b = decide(m, relabelled, method, seed)
    assert [b.borda_points_x2[perm[o]] for o in range(m)] == list(a.borda_points_x2)
    assert b.condorcet_winner == (None if a.condorcet_winner is None else perm[a.condorcet_winner])
    # IRV eliminations among equal counts follow the label-based tie-break order: not neutral by design.
    if method is not Method.IRV:
        assert b.outcome == a.outcome
        assert sorted(perm[o] for o in top_set(m, ballots, method, seed)) == list(
            top_set(m, relabelled, method, seed)
        )


@pytest.mark.parametrize("method", list(Method))
@FAST
@given(prof=profiles(), seed=seeds, data=st.data())
def test_anonymity_ballot_order_does_not_matter(
    method: Method, prof: Prof, seed: str, data: st.DataObject
) -> None:
    m, ballots = prof
    shuffled = data.draw(st.permutations(ballots))
    assert decide(m, shuffled, method, seed) == decide(m, ballots, method, seed)


@pytest.mark.parametrize("method", list(Method))
@FAST
@given(prof=profiles(), seed=seeds)
def test_determinism_same_input_same_bytes(method: Method, prof: Prof, seed: str) -> None:
    m, ballots = prof
    a, b = decide(m, ballots, method, seed), decide(m, list(ballots), method, seed)
    assert repr(a) == repr(b)
    assert repr(explain(a)) == repr(explain(b))


@FAST
@given(prof=profiles(min_options=2), seed=seeds)
def test_irv_single_winner_has_majority_of_active_ballots_in_final_round(prof: Prof, seed: str) -> None:
    m, ballots = prof
    d = decide(m, ballots, Method.IRV, seed)
    assert d.irv_rounds is not None
    assert len(d.irv_rounds) <= m
    eliminated = {r.eliminated for r in d.irv_rounds if r.eliminated is not None}
    assert d.chosen not in eliminated
    final = d.irv_rounds[-1]
    assert final.eliminated is None
    if d.winner is not None:
        assert 2 * dict(final.counts)[d.winner] > len(ballots) - final.exhausted
    elif d.outcome == "tie":
        assert len({c for _, c in final.counts}) == 1


@FAST
@given(prof=profiles(min_ballots=1), seed=seeds)
def test_condorcet_winner_is_declared_by_condorcet_borda(prof: Prof, seed: str) -> None:
    m, ballots = prof
    d = decide(m, ballots, Method.CONDORCET_BORDA, seed)
    if d.condorcet_winner is not None:
        assert (d.winner, d.decided_by) == (d.condorcet_winner, "condorcet")
    else:
        assert d.decided_by == "borda"


@FAST
@given(prof=profiles(min_options=2, min_ballots=1), seed=seeds)
def test_borda_never_elects_a_condorcet_loser(prof: Prof, seed: str) -> None:
    m, ballots = prof
    d = decide(m, ballots, Method.BORDA, seed)
    w = d.pairwise_wins
    losers = [a for a in range(m) if all(w[b][a] > w[a][b] for b in range(m) if b != a)]
    for loser in losers:
        assert loser not in top_set(m, ballots, Method.BORDA, seed)


@pytest.mark.parametrize("method", [Method.BORDA, Method.CONDORCET_BORDA, Method.MINIMAX_REGRET])
@FAST
@given(prof=profiles(min_options=2, min_ballots=1), seed=seeds, data=st.data())
def test_pareto_unanimously_dominated_option_never_wins(
    method: Method, prof: Prof, seed: str, data: st.DataObject
) -> None:
    m, ballots = prof
    a, b = data.draw(st.permutations(range(m)))[:2]
    # Force every ballot to rank a strictly above b.
    fixed = []
    for v in ballots:
        rest = [o for o in v if o not in (a, b)]
        fixed.append((a, *rest) if b not in v else (a, *rest, b))
    assert b not in top_set(m, fixed, method, seed)


@FAST
@given(prof=profiles(min_ballots=1), seed=seeds)
def test_minimax_regret_choice_is_no_worse_than_any_option(prof: Prof, seed: str) -> None:
    m, ballots = prof
    d = decide(m, ballots, Method.MINIMAX_REGRET, seed)
    assert d.regrets is not None
    assert d.chosen is not None
    assert all(d.regrets[d.chosen] <= r for r in d.regrets)


@FAST
@given(prof=profiles(), seed=seeds)
def test_borda_points_total_is_fixed_by_profile_size(prof: Prof, seed: str) -> None:
    m, ballots = prof
    d = decide(m, ballots, Method.BORDA, seed)
    assert sum(d.borda_points_x2) == len(ballots) * m * (m - 1)


@pytest.mark.parametrize("method", list(Method))
@FAST
@given(prof=profiles(min_ballots=1), seed=seeds)
def test_ties_are_reported_and_tiebreak_follows_seeded_order(method: Method, prof: Prof, seed: str) -> None:
    m, ballots = prof
    d = decide(m, ballots, method, seed)
    order = tiebreak_order(m, seed)
    assert sorted(order) == list(range(m))
    if d.outcome == "tie":
        assert len(d.tied) >= 2
        assert d.winner is None
        assert d.tiebreak_pick == next(o for o in order if o in d.tied)
        codes = [r.code for r in explain(d)]
        assert codes[-2:] == ["tie", "tiebreak"]
    else:
        assert d.tied == ()
        assert d.tiebreak_pick is None
        assert d.winner is not None


@FAST
@given(prof=profiles(min_ballots=1), seed=seeds, other=seeds)
def test_tiebreak_seed_never_changes_who_is_tied(prof: Prof, seed: str, other: str) -> None:
    m, ballots = prof
    assume(seed != other)
    a = decide(m, ballots, Method.BORDA, seed)
    b = decide(m, ballots, Method.BORDA, other)

    def strip(d: Decision) -> Decision:
        return replace(d, tiebreak_pick=None, tiebreak_order=(), irv_rounds=None)

    assert strip(a) == strip(b)
