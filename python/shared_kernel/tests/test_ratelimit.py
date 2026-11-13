from __future__ import annotations

import time

import pytest
from hypothesis import given
from hypothesis import strategies as st

from shared_kernel.ratelimit import FixedWindowLimiter, Rule


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_allows_up_to_limit_then_rejects_until_window_resets() -> None:
    clock = FakeClock()
    lim = FixedWindowLimiter(Rule(limit=3, window_s=60), clock=clock)
    assert [lim.hit("a") for _ in range(3)] == [None, None, None]
    clock.now += 10
    assert lim.hit("a") == pytest.approx(50)
    assert lim.hit("b") is None  # keys are independent
    clock.now += 50
    assert lim.hit("a") is None


def test_rule_validation() -> None:
    with pytest.raises(ValueError, match="limit"):
        Rule(limit=0, window_s=1)
    with pytest.raises(ValueError, match="limit"):
        Rule(limit=1, window_s=0)


def test_expired_windows_are_evicted() -> None:
    clock = FakeClock()
    lim = FixedWindowLimiter(Rule(limit=1, window_s=60), clock=clock)
    for i in range(50):
        lim.hit(f"ip-{i}")
    clock.now += 61
    lim.hit("fresh")
    assert len(lim) == 1


def test_memory_is_bounded_under_a_flood_of_distinct_clients() -> None:
    lim = FixedWindowLimiter(Rule(limit=1, window_s=86_400), clock=FakeClock(), max_keys=100)
    for i in range(1000):
        lim.hit(f"ip-{i}")
    assert len(lim) == 100


def test_budget_flood_of_new_clients_stays_cheap() -> None:
    # Budget test (TESTING_STRATEGY §2): eviction must not degrade to a scan/sort per hit.
    lim = FixedWindowLimiter(Rule(limit=5, window_s=86_400), max_keys=1_000)
    started = time.perf_counter()
    for i in range(100_000):
        lim.hit(f"ip-{i}")
    assert time.perf_counter() - started < 1.0
    assert len(lim) == 1_000


@given(st.lists(st.sampled_from(["a", "b", "c"]), max_size=60), st.integers(min_value=1, max_value=5))
def test_never_allows_more_than_limit_per_key_within_one_window(keys: list[str], limit: int) -> None:
    lim = FixedWindowLimiter(Rule(limit=limit, window_s=60), clock=FakeClock())
    allowed: dict[str, int] = {}
    for k in keys:
        if lim.hit(k) is None:
            allowed[k] = allowed.get(k, 0) + 1
    for k in set(keys):
        assert allowed.get(k, 0) == min(limit, keys.count(k))
