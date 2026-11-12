# CLAUDE.md — AlgoHub repository rules

You are working in **AlgoHub**, a monorepo for a platform of 32 independent algorithmic web products.
Read this file first in every session. Then follow `/inspect`.

Authoritative documents (read in this order when context is missing):
1. `BUILD_STATE.md` — current state, exact commands, last test results, next action.
2. `ARCHITECTURE_PLAN.md` — structure, product profiles, boundaries, ADR summaries.
3. `TESTING_STRATEGY.md` — what tests are mandatory and how `dod` works.
4. `DEVOPS_AND_WORKFLOW.md` — commands, CI, session protocol, roadmap.
5. `PROJECT_CATALOG.md`, `PROJECT_INDEX.md`, `products/<id>/docs/STATUS.md`.

## Stack (fixed by ADR — do not re-decide)
- TS: pnpm workspaces + Turborepo, Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui-based `@algohub/ui`, Vitest, fast-check, Playwright, ESLint (+boundaries, +jsx-a11y).
- Python 3.12: uv workspace, FastAPI, SQLAlchemy 2 + Alembic, pydantic v2, structlog, pytest, hypothesis, schemathesis, ruff, mypy --strict, import-linter, OR-Tools for solvers.
- Postgres 16, schema per product. No Redis. Docker Compose for local/CI.
- Single web app `apps/portal-web`; single API `services/algo-api`; worker `services/algo-worker`.
- One directory per product: `products/<id>-<slug>/{web,api,docs,scenarios}`.

## Commands
`just setup` · `just up` · `just dev` · `just test [ID]` · `just e2e [ID]` · `just dod ID` · `just gen ID slug --profile X` · `just index` · `just checkpoint`.
Never invent other entry points; if a command is missing, add it to `justfile` and document it in `DEVOPS_AND_WORKFLOW.md`.

## Hard rules
1. **Vertical slices.** One small end-to-end slice per cycle (UI → API → domain → persistence only if needed). Do not start a new product until the current slice is reproducible with tests.
2. **Boundaries are enforced by linters.** A product never imports another product. `python/algorithms` is pure (no DB, HTTP, settings). Only `services/algo-api` knows the full product list. Do not disable boundary rules; fix the design.
3. **Honesty of status.** Statuses are `NOT_STARTED, DISCOVERY, DESIGNED, IN_PROGRESS, MVP_READY, VALIDATING, LIVE, BLOCKED`. You may not set `MVP_READY` or `LIVE` by hand — only after `just dod ID` is green. If a check could not run, report `NOT RUN: <reason>`. Never claim tests, builds, browser checks or deploys passed if you did not run them. Reports must include the commands and their actual output summary (counts, durations).
4. **Honesty of data.** Any external or computed figure carries `Provenance {source: live|demo|user, fetched_at, confidence?}`. Demo data is visibly labeled in UI. Demo must never be presented as real.
5. **Algorithms are tested four ways** (oracle, property, golden scenarios, budget) — see `TESTING_STRATEGY.md §2`. Tests are written with the code, not after.
6. **Contracts.** API under `/api/v1/<pid>`. `services/algo-api/openapi.json` is committed; regenerate `packages/api-client` after any API change. Breaking change → new version, ADR.
7. **Secrets** only via env. `.env.example` has no secret values. No server env value may reach the client bundle. Never read `.env`.
8. **Privacy by design.** No real personal data in tests, fixtures, scenarios or demo mode. Public endpoints never leak tokens, hashes, other participants' private inputs or exact locations. Every product declares retention.
9. **Language.** Code, identifiers, commits, OpenAPI, ADR titles — English. Product docs (`README/PRD/STATUS/...`) and UI content — Russian; i18n keys English (`next-intl`).
10. **Git.** Trunk-based; branches `feat/<pid>-…`, `chore/…`, `adr/…`; Conventional Commits with product scope; squash-merge. Commits and pushes are made **only from the repository owner's account**. Never add `Co-Authored-By`, "Generated with", or any tool/agent attribution to commit messages, PR bodies or files. Never push to `main`, never force-push, never rewrite history.
11. **Ask only when it matters:** money (paid APIs, cloud), irreversible actions, publishing/deploying, product forks that change a PRD, deviations from an ADR. Everything else: decide, record the assumption in `products/<id>/docs/STATUS.md → Assumptions`, continue.
12. **Platform work is not a hiding place.** Changes to `packages/*`, `python/shared_kernel`, CI are allowed only when listed in the current roadmap phase or produced by a product retrospective. Three sessions without changes in `products/` is a red flag — say so in `BUILD_STATE.md`.

## Session protocol (see DEVOPS_AND_WORKFLOW.md §5.3)
`/inspect` → `/slice` → `/verify` → `/checkpoint` (every 40–60 min) → `reviewer` subagent before PR → `/handoff`.
End every session at a stable checkpoint and emit a **NEXT SESSION PROMPT** (3–8 lines).

## Definition of Done (summary; `just dod ID` is the source of truth)
docs: README, PRD, ARCHITECTURE, VALIDATION, STATUS, DECISIONS, CHANGELOG · ≥3 golden scenarios · lint/typecheck/unit/property green · contract snapshot current (if api) · integration with real Postgres (if db) · Playwright happy path against compose · axe clean on happy-path screens · `.env.example` current · entry in `apps/portal-web/src/registry.ts` with correct status.

## Where things live
- Product registry (single source of truth for catalog): `apps/portal-web/src/registry.ts` → `just index` regenerates `PROJECT_INDEX.md`.
- Reusable algorithm kernels: `python/algorithms/<domain>/`; client-side kernels: `products/<id>/web/src/algo/`.
- Cross-cutting Python: `python/shared_kernel/` (settings, db, jobs, logging, errors, principal, provenance).
- Cross-cutting TS: `packages/core` (Provenance, Result, url-state codec, i18n helpers), `packages/ui`, `packages/api-client`.
- ADRs: `docs/adr/NNNN-title.md`. Spikes: `docs/SPIKE-*.md`.
- Hooks and commands: `.claude/`.

## Never
- Mock a product as "working" when it is a landing page.
- Share database tables across products or add cross-schema foreign keys.
- Add Redis, a gateway, Terraform, auth providers or payments without an ADR tied to a measured need.
- Ship an endpoint without validation, authz and a rate limit on writes.
- Leave a session with uncommitted work or a red `main`.
