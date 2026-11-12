# BUILD_STATE

- Updated: 2026-11-12
- Phase: **0 «Scaffold» — done** (DEVOPS_AND_WORKFLOW.md §6). Next: **Phase 1 «Портал»**.
- Branch: `chore/scaffold` → PR #6 to `main` (opened by the owner; gh is not authenticated). Merge = squash. Commit: see `git log -1`.
- Products: 32 in registry, all `NOT_STARTED`; `products/` is empty (expected for Phase 0).

## What exists

| Area | State |
|---|---|
| Monorepo | pnpm 12 workspaces + Turborepo 2.11; uv workspace (Python 3.12); `justfile` facade |
| `apps/portal-web` | Next.js 15.5 App Router: home page (RU), `/api/health`, Tailwind v4 via `@algohub/ui/styles.css`; `src/registry.ts` (32 products, data only) |
| `packages/core` | `Result`, `Provenance` (+ `parseProvenance`), status/profile vocabulary |
| `packages/ui` | `Button` (asChild), `Input`, `Card*` (heading level configurable), `Badge`, `PageShell` (landmarks + skip link), tokens + dark theme + reduced motion |
| `packages/config` | tsconfig presets (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `python/shared_kernel` | `settings` (pydantic-settings, fail-fast `ConfigurationError`), `logging` (structlog JSON, request-id middleware, PII/token redaction), `errors` (envelope `{error:{code,message,details?,request_id}}`), `health` (`/healthz`, `/readyz` with checks), `db` (engine, session scope, ping) |
| `python/algorithms` | empty pure package (import-linter: no DB/HTTP/settings) |
| `services/algo-api` | composition root, CORS allowlist, product mounts under `/api/v1/<pid>` (none yet), `openapi.json` snapshot + check |
| Boundaries | ESLint `boundaries/dependencies` (package↛product/app, product↛product), client env rule; import-linter 2 contracts |
| Tools | `gen-product` (docs+scenarios skeleton, `--dry-run`), `dod` (file checks real; execution checks NOT_RUN → verdict never GREEN yet), `index-sync` (`just index`, `--check` in lint) |
| Quality gates | pre-commit (14 hooks incl. gitleaks, ruff, mypy, eslint, prettier, commit-msg attribution check); CI `ci.yml`: commit-hygiene, static, test-ts (+ build), test-py (+ Postgres 16 service, integration) |
| Claude Code | `.claude/settings.json` (`attribution` off, allow/deny, hooks), commands: inspect/slice/verify/checkpoint/new-product/handoff; agents: reviewer/algo-tester/spike |
| Docs | ADR-0001…0005, `docs/TOOLCHAIN.md`, README, CHANGELOG, DEVOPS §1 updated with new recipes |

## Commands (exact)

```bash
just setup        # first time: ~6 min (gitleaks hook env build); later seconds
just up           # needs Docker
just dev          # portal :3000 + api :8000
just lint && just typecheck && just test
just verify       # lint + typecheck + test + next build
```

## Last verification (2026-11-12, macOS arm64, local)

| Check | Command | Result |
|---|---|---|
| setup | `just setup` | ✅ 6m16s (pnpm 415 pkgs, uv sync, hooks installed, .env created) |
| lint | `just lint` | ✅ 2.5s — ESLint 0 problems, Prettier clean, ruff clean, import-linter 2 kept / 0 broken, index up to date |
| typecheck | `just typecheck` | ✅ 3.2s — tsc 6/6 packages; mypy --strict: shared_kernel 12 files, algorithms 1, algo-api 8 — no issues |
| unit TS | `pnpm test` | ✅ 41 tests (core 18, ui 4 incl. axe, portal-web 5, dod 6, gen-product 7, index-sync 1) |
| unit Py | `uv run pytest` | ✅ 32 passed, 3 deselected (integration) in 1.9s |
| contract | `export_openapi --check` | ✅ up to date |
| all-in-one | `just verify` | ✅ 22s (lint + typecheck + test + `next build`) after review fixes |
| build | `pnpm --filter @algohub/portal-web build` | ✅ `/`, `/api/health` |
| dev | `just dev` + curl | ✅ `/healthz` 200 with `x-request-id`; `/readyz` 503 `{database: fail}` (no DB — correct); portal `/` 200, `/api/health` 200; page checked in browser, 0 console errors |
| boundaries probe | temp files: product→product, package→app, page→product, registry→product; env in `"use client"` (member/computed/destructuring) and in packages | ✅ violations reported, registry→product allowed (probes deleted) |
| review | fresh-context reviewer subagent | 2 major + 10 minor found → all fixed: 500 now keeps request id + CORS; push deny rules closed (`--force`/`:main` after allow-prefix); checkpoint message injection; dev trap; Stop hook output; HTTP error headers/non-standard codes; registry-only product imports; env rule; doc inconsistencies |
| pre-commit | `pre-commit run --all-files` | ✅ 14/14 hooks, ~9s |
| CI config | `actionlint` (+ shellcheck 0.11) | ✅ no findings |
| tools | `just gen P17 fairteams --profile CLIENT --dry-run`; `just dod P15` | ✅ plans 8 files; dod prints table, RED (no product dir) exit 1 — expected |
| infra | `just up`, `just test-int` | **NOT RUN: Docker is not installed** (owner chose to continue without it) |
| e2e | `just e2e` | **NOT RUN: no Playwright suite yet (Phase 1)** |
| CI on GitHub | PR #6, commit `0537b16` | ✅ commit hygiene, static, test-ts (+ build), test-py (+ **integration vs real Postgres 16**) — all success. First run failed: `astral-sh/setup-uv@v10` tag does not exist → pinned by SHA (v10.3.3) |

## Known gaps / assumptions

- **`main` bootstrap (one-time, owner-approved exception to rule 10):** the GitHub repo was empty, so `main` = empty root
  commit `ef0fab2 chore: initialize repository`, merged into `chore/scaffold` (no history rewrite). The project deny rule
  blocked the agent from pushing it; the owner runs `git push origin main` once. Afterwards: enable branch protection on `main`.

- Docker absent → Postgres and `/readyz`=ready never ran on this machine; integration tests are green in CI only.
- `PROJECT_CATALOG.md` was not in the repo; product names/profiles/waves taken from ARCHITECTURE_PLAN §3. Taglines missing → Phase 1.
- `registry.ts` created in Phase 0 (data only) because `PROJECT_INDEX.md` must be generated from it.
- Not yet present (by plan): `@algohub/api-client`, alembic, worker, Dockerfiles, `compose.ci.yml`, umami, next-intl, security headers, Playwright, knip, dependency-review.
- ESLint pinned to 9 (jsx-a11y not yet on 10); TypeScript 5.9 (typescript-eslint < 6.1).
- Node 24 LTS installed alongside old Node 20 (see docs/TOOLCHAIN.md for rollback).

## Next action

Phase 1 «Портал»: registry with taglines/tags, catalog + client search + status cards, landing template with
`notify_me` (`platform.waitlist`), next-intl (RU), security headers, Playwright smoke + axe on home, `just e2e`.
