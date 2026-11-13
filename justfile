# AlgoHub — single command facade (DEVOPS_AND_WORKFLOW.md §1). `just --list` shows everything.
# Never add entry points elsewhere; new commands go here and into DEVOPS_AND_WORKFLOW.md.

set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

compose := "docker compose -f infra/compose/docker-compose.yml --env-file .env"
py_members := "python/shared_kernel python/algorithms services/algo-api"

# List recipes
default:
    @just --list --unsorted

# Install all dependencies and git hooks; create .env from .env.example if missing
setup:
    pnpm install --frozen-lockfile
    uv sync --frozen
    uv run pre-commit install --install-hooks --hook-type pre-commit --hook-type commit-msg
    @if [ ! -f .env ]; then cp .env.example .env && echo "created .env from .env.example"; else echo ".env exists (kept)"; fi

# Start infrastructure (Postgres) and apply migrations
up: _require-docker
    {{ compose }} up -d --wait postgres
    just migrate

# Stop infrastructure (data volume is kept)
down: _require-docker
    {{ compose }} --profile test down

# Apply Alembic migrations: platform schema first (services/algo-api), then every product that has them
migrate:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    echo "migrating platform (services/algo-api)"
    uv run alembic -c services/algo-api/alembic.ini upgrade head
    for ini in products/*/api/alembic.ini; do
        echo "migrating ${ini%/alembic.ini}"
        uv run alembic -c "$ini" upgrade head
    done

# Delete waitlist sign-ups older than the retention period (365 days); needs a database
purge-waitlist:
    uv run python -m algo_api.platform.purge_waitlist

# Run portal-web (Next.js, :3000) and algo-api (uvicorn --reload, :8000) together; Ctrl-C stops both
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'trap - EXIT INT TERM; kill 0' EXIT INT TERM
    uv run uvicorn algo_api.main:create_app --factory --reload --host 127.0.0.1 --port 8000 \
        --reload-dir services --reload-dir python --reload-dir products &
    pnpm dev &
    wait

# Static checks: ESLint (+boundaries, +jsx-a11y), Prettier, ruff, import-linter, registry/index drift
lint:
    pnpm lint
    pnpm format:check
    uv run ruff check .
    uv run ruff format --check .
    uv run lint-imports
    pnpm --filter @algohub/tool-index-sync exec tsx src/main.ts --check

# Type checks: tsc (all TS packages) + mypy --strict per Python member
typecheck:
    pnpm typecheck
    for m in {{ py_members }}; do uv run mypy "$m"; done

# Unit + property tests (all, or one product: `just test P15`)
test id="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "{{ id }}" ]; then
        pnpm test
        uv run pytest
        uv run python -m algo_api.export_openapi --check
        exit 0
    fi
    pid="$(echo "{{ id }}" | tr '[:upper:]' '[:lower:]')"
    shopt -s nullglob
    dirs=(products/"$pid"-*)
    if [ ${#dirs[@]} -eq 0 ]; then echo "no products/$pid-* directory" >&2; exit 1; fi
    dir="${dirs[0]}"
    ran=0
    if [ -f "$dir/web/package.json" ]; then pnpm turbo run test --filter="./$dir/web"; ran=1; fi
    if [ -d "$dir/api" ]; then uv run pytest "$dir/api"; ran=1; fi
    if [ "$ran" = 0 ]; then echo "NOT RUN: $dir has no web/ or api/ package yet" >&2; exit 1; fi

# Integration tests against a throwaway Postgres (tmpfs), then stop it
test-int: _require-docker
    #!/usr/bin/env bash
    set -uo pipefail
    {{ compose }} --profile test up -d --wait postgres-test || exit 1
    uv run pytest -m integration
    status=$?
    {{ compose }} --profile test stop postgres-test
    exit $status

# Playwright e2e. No id: portal smoke (desktop + mobile, axe, headers) against a production build served by
# `next start`; the API is intercepted in-browser. Product happy paths against compose arrive with P15.
e2e id="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -n "{{ id }}" ]; then
        echo "NOT RUN: product e2e for {{ id }} needs compose.ci.yml + Dockerfiles (Phase 2, P15)" >&2
        exit 1
    fi
    # E2E_BROWSER_CHANNEL=chrome uses the installed Google Chrome and skips the Chromium download.
    if [ -z "${E2E_BROWSER_CHANNEL:-}" ]; then pnpm --filter @algohub/portal-web exec playwright install chromium; fi
    pnpm --filter @algohub/portal-web e2e

# Definition of Done report for a product: `just dod P15`
dod id:
    pnpm --silent dod {{ id }}

# Generate a product skeleton: `just gen P17 fairteams --profile CLIENT`
gen +args:
    pnpm --silent gen:product {{ args }}

# Regenerate PROJECT_INDEX.md from apps/portal-web/src/registry.ts
index:
    pnpm --silent index:sync

# Regenerate the committed OpenAPI snapshot services/algo-api/openapi.json
openapi:
    uv run python -m algo_api.export_openapi

# Everything CI runs without Docker: lint + typecheck + unit + portal production build
verify: lint typecheck test
    pnpm build

# Fast profile (lint + typecheck + unit), then commit all changes on the current non-main branch
[positional-arguments]
checkpoint message="chore: checkpoint":
    #!/usr/bin/env bash
    set -euo pipefail
    msg="$1"  # passed as an argument, never interpolated into the script (no command injection)
    branch="$(git branch --show-current)"
    if [ "$branch" = "main" ]; then echo "refusing to checkpoint on main; create a branch first" >&2; exit 1; fi
    just lint typecheck test
    git diff --quiet -- BUILD_STATE.md && git diff --cached --quiet -- BUILD_STATE.md \
        && echo "reminder: BUILD_STATE.md was not updated in this checkpoint" >&2 || true
    git add -A
    git commit -m "$msg"

_require-docker:
    @command -v docker >/dev/null 2>&1 || { echo "NOT RUN: docker is not installed (see docs/TOOLCHAIN.md)" >&2; exit 1; }
    @docker info >/dev/null 2>&1 || { echo "NOT RUN: docker daemon is not running (start Docker Desktop)" >&2; exit 1; }
