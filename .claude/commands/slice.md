---
description: Plan and implement exactly one vertical slice
argument-hint: <slice description or "next">
---
Implement ONE vertical slice: $ARGUMENTS (if "next" or empty — take `BUILD_STATE.md → Next action`).

1. Write acceptance criteria into `products/<id>/docs/STATUS.md → Acceptance criteria` BEFORE code
   (platform slices: into `BUILD_STATE.md`).
2. Implement UI → API → domain → persistence (persistence only if needed). Respect boundaries
   (eslint-plugin-boundaries, import-linter); never disable a rule — fix the design.
3. Tests are written together with the code: algorithms get oracle, property, golden and budget tests
   (`TESTING_STRATEGY.md §2`); endpoints get validation, authz, limits, idempotency tests.
4. API changed → `just openapi` and regenerate `@algohub/api-client`; commit the snapshot.
5. Ask the user only about money, irreversible actions, publishing, PRD forks or ADR deviations.
   Everything else: decide and record in `STATUS.md → Assumptions`.
6. Keep the diff ≤ ~600 lines (excluding generated code); otherwise split the slice.
Finish with `/verify`.
