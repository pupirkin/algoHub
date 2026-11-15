"""Hypothesis strategies for social-choice profiles (TESTING_STRATEGY §2.2), reused by products."""

from __future__ import annotations

from hypothesis import strategies as st

from algorithms.social_choice import Ballot


@st.composite
def ballots_for(draw: st.DrawFn, n_options: int, *, partial: bool = True) -> Ballot:
    """A ballot over ``n_options``: a permutation of a non-empty subset (or of all options)."""
    order = draw(st.permutations(range(n_options)))
    k = draw(st.integers(1, n_options)) if partial else n_options
    return tuple(order[:k])


@st.composite
def profiles(
    draw: st.DrawFn,
    *,
    min_options: int = 1,
    max_options: int = 6,
    min_ballots: int = 0,
    max_ballots: int = 9,
    partial: bool = True,
) -> tuple[int, list[Ballot]]:
    m = draw(st.integers(min_options, max_options))
    ballots = draw(st.lists(ballots_for(m, partial=partial), min_size=min_ballots, max_size=max_ballots))
    return m, ballots


seeds = st.text(alphabet="0123456789abcdef-", min_size=1, max_size=36)
