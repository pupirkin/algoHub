# Changelog

All notable changes to this product are documented here (Keep a Changelog).

## [Unreleased]
### Added
- Social-choice kernel `algorithms.social_choice`: Condorcet, Borda (partial ballots), IRV, minimax regret,
  seeded tie-break, structured explanation; oracle/property/golden/budget tests.
- Schema `p15` (rooms, options, participants, ballots, results) with migration `0001`, retention 30 days.
- API `/api/v1/p15`: create/join/vote/close/result/delete with capability tokens, rate limits, deadlines.
- Seven golden scenarios in `scenarios/`.
- Product skeleton generated.
