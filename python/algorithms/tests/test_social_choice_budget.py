"""Budget and degenerate inputs (TESTING_STRATEGY §2.4-2.5).

Budget: the largest room P15 allows (50 ballots x 10 options) is decided synchronously inside a request, so
every method must stay far below a request's latency budget. 25 ms is the ceiling for the p95 of 30 runs on
the reference input (typical: well under 2 ms); a regression of an order of magnitude fails the test.
"""

from __future__ import annotations

import random
import time

import pytest

from algorithms.social_choice import Method, decide, explain, make_profile

BUDGET_MS = 25.0
MAX_BALLOTS, MAX_OPTIONS = 50, 10


def reference_profile() -> list[tuple[int, ...]]:
    rng = random.Random(15)  # noqa: S311 — fixed seed: the reference input must not change between runs
    ballots = []
    for _ in range(MAX_BALLOTS):
        order = list(range(MAX_OPTIONS))
        rng.shuffle(order)
        ballots.append(tuple(order[: rng.randint(1, MAX_OPTIONS)]))
    return ballots


@pytest.mark.parametrize("method", list(Method))
def test_largest_room_is_decided_within_budget(method: Method) -> None:
    ballots = reference_profile()
    timings = []
    for _ in range(30):
        start = time.perf_counter()
        explain(decide(MAX_OPTIONS, ballots, method, "budget-room"))
        timings.append((time.perf_counter() - start) * 1000)
    p95 = sorted(timings)[int(0.95 * len(timings)) - 1]
    assert p95 < BUDGET_MS, f"{method}: p95 {p95:.2f} ms >= {BUDGET_MS} ms"


@pytest.mark.parametrize(
    ("n_options", "ballots", "message"),
    [
        (0, [], "n_options must be a positive integer"),
        (True, [], "n_options must be a positive integer"),
        (3, [()], "ballot 0 is empty"),
        (3, [(0, 3)], "outside 0..2"),
        (3, [(0, -1)], "outside 0..2"),
        (3, [(0, True)], "outside 0..2"),
        (3, [(1, 0), (2, 2)], "ballot 1 lists an option twice"),
    ],
)
def test_invalid_input_is_rejected_with_a_readable_message(
    n_options: int, ballots: list[tuple[int, ...]], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        make_profile(n_options, ballots)


@pytest.mark.parametrize("method", list(Method))
def test_no_ballots_is_an_explicit_outcome_not_a_winner(method: Method) -> None:
    d = decide(4, [], method, "empty")
    assert (d.outcome, d.chosen) == ("no_ballots", None)
    assert [r.code for r in explain(d)] == ["no_ballots"]


@pytest.mark.parametrize("method", list(Method))
def test_single_option_wins(method: Method) -> None:
    d = decide(1, [(0,), (0,)], method, "one")
    assert (d.outcome, d.winner) == ("winner", 0)


@pytest.mark.parametrize("method", list(Method))
def test_unanimous_ballots_elect_the_common_favourite(method: Method) -> None:
    d = decide(5, [(3, 1, 0, 2, 4)] * 7, method, "same")
    assert d.winner == 3


@pytest.mark.parametrize("method", list(Method))
def test_perfect_cycle_is_a_tie_with_a_seeded_pick(method: Method) -> None:
    # Rock-paper-scissors: no Condorcet winner, equal Borda points, equal first choices, equal regret.
    d = decide(3, [(0, 1, 2), (1, 2, 0), (2, 0, 1)], method, "cycle")
    assert d.condorcet_winner is None
    assert (d.outcome, d.tied) == ("tie", (0, 1, 2))
    assert d.tiebreak_pick in d.tied
    assert [r.code for r in explain(d)][-2:] == ["tie", "tiebreak"]
