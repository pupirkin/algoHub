---
description: Run the full check ladder and report honestly with real output
argument-hint: "[product ID]"
---
Run checks in this order and report each with the exact command, pass/fail, counts and duration:

1. `just lint`  2. `just typecheck`  3. `just test $ARGUMENTS`
4. contract: `uv run python -m algo_api.export_openapi --check`
5. `just test-int` (needs Docker)  6. `just e2e $ARGUMENTS` (needs Docker)
7. if a product ID was given: `just dod $ARGUMENTS`

Rules: a step that could not run is reported as `NOT RUN: <reason>` — never as passed.
Paste the summary lines of real output (e.g. "30 passed in 2.1s"). If something is red, fix it and
re-run the whole ladder. Never raise a status in `registry.ts` unless `just dod` is GREEN.
Report template:

| Step | Command | Result | Evidence |
|---|---|---|---|
