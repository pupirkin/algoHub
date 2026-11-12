---
description: Update BUILD_STATE.md and commit a stable checkpoint
argument-hint: "[commit message]"
---
Make a checkpoint (every 40–60 minutes or after each green sub-step):

1. Update `BUILD_STATE.md` (≤ 150 lines): date, branch, last commit, what is done, exact commands,
   latest test results with numbers, known bugs, next action. Product details go to its `STATUS.md`.
2. If `registry.ts` changed, run `just index`.
3. Run `just checkpoint "$ARGUMENTS"` (lint + typecheck + unit, then `git add -A && git commit`).
   Default message `chore: checkpoint`; prefer a Conventional Commit with product scope.
   Commit messages never contain Co-Authored-By or tool attribution (enforced by the commit-msg hook).
4. Never checkpoint on `main`; never push to `main`.
