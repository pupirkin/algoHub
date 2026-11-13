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

# Delete a product's expired data per its retention policy (`products/<id>/api/.../retention.py`); needs a database
purge id:
    #!/usr/bin/env bash
    set -euo pipefail
    pid="$(echo "{{ id }}" | tr '[:upper:]' '[:lower:]')"
    uv run python -m "algohub_${pid}.retention"

# Run portal-web (Next.js, :3000) and algo-api (uvicorn --reload, :8000) together; Ctrl-C stops both
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'trap - EXIT INT TERM; kill 0' EXIT INT TERM
    uv run uvicorn algo_api.main:create_app --factory --reload --host 127.0.0.1 --port 8000 \
        --reload-dir services --reload-dir python --reload-dir products &
    pnpm dev &
    wait

# Local preview without Docker: algo-api with P15 on an IN-MEMORY store (:8000) + portal with ALGOHUB_FLAGS=preview:P15
preview:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'trap - EXIT INT TERM; kill 0' EXIT INT TERM
    uv run uvicorn algo_api.preview:create_preview_app --factory --host 127.0.0.1 --port 8000 &
    ALGOHUB_FLAGS=preview:P15 pnpm dev &
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
    for m in {{ py_members }} products/*/api; do uv run mypy "$m"; done

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

# Playwright e2e. No id: portal smoke (desktop + mobile, axe, headers) against `next start`, API intercepted in-browser.
# With an id (`just e2e P15`): the product happy path against docker compose (compose.ci.yml) — the MVP_READY gate.
e2e id="":
    #!/usr/bin/env bash
    set -euo pipefail
    # E2E_BROWSER_CHANNEL=chrome uses the installed Google Chrome and skips the Chromium download.
    if [ -z "${E2E_BROWSER_CHANNEL:-}" ]; then pnpm --filter @algohub/portal-web exec playwright install chromium; fi
    if [ -z "{{ id }}" ]; then
        pnpm --filter @algohub/portal-web e2e
        exit 0
    fi
    pid="$(echo "{{ id }}" | tr '[:upper:]' '[:lower:]')"
    if [ ! -f "apps/portal-web/e2e-products/$pid.spec.ts" ]; then echo "NOT RUN: no e2e-products/$pid.spec.ts" >&2; exit 1; fi
    command -v docker >/dev/null 2>&1 || { echo "NOT RUN: docker is not installed (see docs/TOOLCHAIN.md)" >&2; exit 2; }
    docker info >/dev/null 2>&1 || { echo "NOT RUN: docker daemon is not running" >&2; exit 2; }
    ci="docker compose -f infra/compose/compose.ci.yml"
    trap '$ci logs --no-color > e2e-compose.log 2>&1 || true; $ci down -v' EXIT
    $ci up -d --build --wait
    E2E_BASE_URL=http://localhost:3000 pnpm --filter @algohub/portal-web exec \
        playwright test -c playwright.products.config.ts "e2e-products/$pid.spec.ts"

# Local smoke of a product's e2e WITHOUT Docker: in-memory API (algo_api.preview) + `next start` with the preview
# flag. Exercises the real UI and API logic but not Postgres or the images — it does NOT count for `just dod`.
e2e-preview id:
    #!/usr/bin/env bash
    set -euo pipefail
    pid="$(echo "{{ id }}" | tr '[:upper:]' '[:lower:]')"
    if [ -z "${E2E_BROWSER_CHANNEL:-}" ]; then pnpm --filter @algohub/portal-web exec playwright install chromium; fi
    NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 pnpm --filter @algohub/portal-web build
    uv run uvicorn algo_api.preview:create_preview_app --factory --host 127.0.0.1 --port 8000 --log-level warning &
    api=$!
    (cd apps/portal-web && ALGOHUB_FLAGS="preview:{{ id }}" exec pnpm exec next start --port 3000 > /dev/null) &
    web=$!
    trap 'pkill -P $api 2>/dev/null; kill $api 2>/dev/null; pkill -P $web 2>/dev/null; kill $web 2>/dev/null; true' EXIT
    for _ in $(seq 1 60); do
        curl -sf http://127.0.0.1:8000/healthz >/dev/null && curl -sf http://127.0.0.1:3000/api/health >/dev/null && break
        sleep 1
    done
    E2E_BASE_URL=http://localhost:3000 pnpm --filter @algohub/portal-web exec \
        playwright test -c playwright.products.config.ts "e2e-products/$pid.spec.ts"

# Definition of Done report for a product: `just dod P15`
dod id:
    pnpm --silent dod {{ id }}

# Generate a product skeleton: `just gen P17 fairteams --profile CLIENT`
gen +args:
    pnpm --silent gen:product {{ args }}

# Regenerate PROJECT_INDEX.md from apps/portal-web/src/registry.ts
index:
    pnpm --silent index:sync

# Regenerate the committed OpenAPI snapshot services/algo-api/openapi.json and @algohub/api-client types
openapi:
    uv run python -m algo_api.export_openapi
    pnpm --filter @algohub/api-client --silent generate

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
