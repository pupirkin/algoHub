# Changelog

All notable changes to this product are documented here (Keep a Changelog).

## [Unreleased]
### Changed
- Status `MVP_READY` (2026-11-15): `just dod P15` GREEN in CI (integration on Postgres 16, compose e2e, axe). The portal
  serves the product at `/p/nomoredebate` without the preview flag.

### Added
- Web UI `@algohub/p15`: create, participant (accessible ranking), organizer and result screens; preview via
  `ALGOHUB_FLAGS=preview:P15`.
- Playwright happy path from `scenarios/*.json` (`ui.steps`), desktop + mobile, axe on every screen.
- `ResultOut.question`.
- Social-choice kernel `algorithms.social_choice`: Condorcet, Borda (partial ballots), IRV, minimax regret,
  seeded tie-break, structured explanation; oracle/property/golden/budget tests.
- Schema `p15` (rooms, options, participants, ballots, results) with migration `0001`, retention 30 days.
- API `/api/v1/p15`: create/join/vote/close/result/delete with capability tokens, rate limits, deadlines.
- Seven golden scenarios in `scenarios/`.
- Product skeleton generated.
