---
description: Restore context and check the real state of the repo before any work
---
Restore context for this session. Do not trust documents on their word — verify.

1. Read `CLAUDE.md`, `BUILD_STATE.md`, `PROJECT_INDEX.md`; skim `docs/adr/` titles.
2. `git status`, `git branch --show-current`, `git log --oneline -20`.
3. If a product is in focus ($ARGUMENTS, e.g. `P15`), read `products/<id>-*/docs/STATUS.md` and `PRD.md`.
4. Run the fast profile and record actual numbers: `just lint`, `just typecheck`, `just test`.
   If Docker is available also `just up` and `just test-int`; otherwise write `NOT RUN: <reason>`.
5. Report in ≤ 15 lines: branch/commit, what is green/red (with counts and durations), discrepancies
   between BUILD_STATE.md and reality, and the single next action from BUILD_STATE.md.
Do not change code in this command.
