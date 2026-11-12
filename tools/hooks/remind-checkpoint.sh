#!/usr/bin/env bash
# Claude Code Stop hook: remind to /checkpoint when uncommitted changes are older than 40 minutes.
# Prints {"systemMessage": ...} on stdout (shown in the session); exit 0 — never forces the agent to continue.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$root" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Modified + untracked (non-ignored) files, NUL-separated: safe for spaces and renames.
oldest=""
while IFS= read -r -d '' f; do
  [ -e "$f" ] || continue
  m=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null) || continue
  if [ -z "$oldest" ] || [ "$m" -lt "$oldest" ]; then oldest=$m; fi
done < <(git ls-files -z --modified --others --exclude-standard)
[ -n "$oldest" ] || exit 0

last_commit=$(git log -1 --format=%ct 2>/dev/null || echo 0)
ref=$oldest
[ "$last_commit" -gt "$ref" ] && ref=$last_commit
age_min=$(( ($(date +%s) - ref) / 60 ))
if [ "$age_min" -ge 40 ]; then
  printf '{"systemMessage": "Uncommitted changes for ~%s min: run /checkpoint (BUILD_STATE.md + commit)."}\n' "$age_min"
fi
exit 0
