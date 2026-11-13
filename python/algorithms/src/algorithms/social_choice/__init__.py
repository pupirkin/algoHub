"""Social choice over (possibly partial) rankings — pure functions, stdlib only.

Used by P15 NoMoreDebate (ARCHITECTURE_PLAN §7). Options are indices ``0..n_options-1``; a ballot lists option
indices from most to least preferred. Options a ballot does not list share its last place.
"""

from algorithms.social_choice.methods import (
    Ballot,
    Decision,
    IrvRound,
    Method,
    Outcome,
    Profile,
    Reason,
    borda_points_x2,
    condorcet_winner,
    decide,
    explain,
    irv,
    make_profile,
    pairwise_wins,
    regrets,
    tiebreak_order,
)

__all__ = [
    "Ballot",
    "Decision",
    "IrvRound",
    "Method",
    "Outcome",
    "Profile",
    "Reason",
    "borda_points_x2",
    "condorcet_winner",
    "decide",
    "explain",
    "irv",
    "make_profile",
    "pairwise_wins",
    "regrets",
    "tiebreak_order",
]
