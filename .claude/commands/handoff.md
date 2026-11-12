---
description: End the session at a stable checkpoint and produce the NEXT SESSION PROMPT
---
Close the session:

1. Run `/verify` (state NOT RUN with reasons for anything that could not run).
2. Spawn the `reviewer` subagent on the branch diff; fix its findings and re-verify.
3. Update `BUILD_STATE.md` (date, branch, commit, done, commands, test results with numbers, known
   bugs, next action), `PROJECT_INDEX.md` (`just index`), product `STATUS.md`/`CHANGELOG.md`.
4. Commit on the feature branch (owner's account, no attribution), `git push -u origin <branch>`,
   open a PR with `gh pr create` using `.github/pull_request_template.md`.
5. Unfinished work goes to a `wip/…` branch with an honest note in BUILD_STATE.md.
6. Print a **NEXT SESSION PROMPT** (3–8 lines) for the next slice/phase.
