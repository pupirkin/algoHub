#!/usr/bin/env bash
# Claude Code PostToolUse hook (Edit|Write): lint only the edited file, < 2 s. Never blocks the edit;
# on findings exits 2 so the messages are fed back to the agent.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
input="$(cat)"
file="$(python3 -c 'import json,sys; d=json.loads(sys.stdin.read() or "{}"); print((d.get("tool_input") or {}).get("file_path",""))' <<<"$input" 2>/dev/null || true)"
[ -n "$file" ] && [ -f "$file" ] || exit 0
case "$file" in "$root"/*) ;; *) exit 0 ;; esac

out=""
case "$file" in
  *.py)
    out="$(cd "$root" && uv run --frozen --quiet ruff check --quiet "$file" 2>&1)" || { echo "$out" >&2; exit 2; } ;;
  *.ts|*.tsx|*.js|*.mjs)
    [ -x "$root/node_modules/.bin/eslint" ] || exit 0
    out="$(cd "$root" && node_modules/.bin/eslint --max-warnings=0 "$file" 2>&1)" || { echo "$out" >&2; exit 2; } ;;
esac
exit 0
