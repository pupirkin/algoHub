#!/usr/bin/env bash
# commit-msg hook + CI check: commits are authored by the repository owner only — no agent/tool attribution.
# Usage: check-commit-msg.sh <file-with-message>   (pre-commit commit-msg stage)
#        check-commit-msg.sh --range <git-range>    (CI: every commit in a PR)
set -euo pipefail

pattern='^co-authored-by:|generated with \[?claude|🤖 generated'

check_text() {
  if grep -Eiq "$pattern" <<<"$1"; then
    echo "commit message contains forbidden attribution (Co-Authored-By / 'Generated with'); remove it" >&2
    return 1
  fi
}

if [ "${1:-}" = "--range" ]; then
  status=0
  for sha in $(git rev-list "$2"); do
    if ! check_text "$(git log -1 --format=%B "$sha")"; then
      echo "  offending commit: $sha" >&2
      status=1
    fi
  done
  exit $status
fi

msg_file="${1:?usage: check-commit-msg.sh <msg-file> | --range <range>}"
check_text "$(grep -v '^#' "$msg_file")"
