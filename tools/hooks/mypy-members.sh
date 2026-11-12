#!/usr/bin/env bash
# pre-commit: mypy --strict per uv workspace member (each member has its own tests/conftest.py).
set -euo pipefail
for m in python/*/ services/*/ products/*/api/; do
  [ -f "$m/pyproject.toml" ] || continue
  uv run --frozen --quiet mypy "$m"
done
