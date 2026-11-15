# BUILD_STATE

- Updated: 2026-11-15
- Phase: **2 «P15 NoMoreDebate» — done (MVP_READY)**, waiting for the owner to squash-merge **PR #7**
  (`feat/portal-catalog` → `main`). Git reality (verified via GitHub API 2026-11-15): PR #8 (`feat/p15-nomoredebate`)
  was squash-merged into `feat/portal-catalog` (`a0d632c`), **not** into `main`; PR #7 is still open and now carries
  Phase 1 (portal) + Phase 2 (P15). `origin/main` = `e13be36` (scaffold). `feat/p15-nomoredebate` is obsolete.
- P15 status: **`MVP_READY`** (registry + STATUS.md) — set only after `just dod P15` was GREEN in CI (run
  43686028535 on `37ceef1`); re-confirmed GREEN in launched mode (no preview flag) on `d7f53db` (run 43686736830).
- Products: 32 in registry; 1 with code (`products/p15-nomoredebate`). Sessions without changes in `products/`: 0.

## What exists

| Area | State |
|---|---|
| **P15 NoMoreDebate** (`MVP_READY`) | `python/algorithms/social_choice` (Condorcet, Borda over partial ballots, IRV, minimax regret, seeded tie-break, `explain`); `products/p15-nomoredebate/api` (`algohub_p15`: schema `p15` + migration 0001, capability tokens, rate limits, lazy deadlines, retention 30 d, SQL + in-memory stores, `/api/v1/p15` 8 endpoints); `products/p15-nomoredebate/web` (`@algohub/p15`: 4 screens, accessible ranking, 3 s polling); 7 golden scenarios; docs 7/7 |
| Platform (Phase 2) | `@algohub/api-client` (generated); `shared_kernel.provenance`; `ProductMount.setup`; `registry.load()` branch in `/p/[slug]` gated by status or `ALGOHUB_FLAGS=preview:<ID>`; `infra/docker/Dockerfile.{api,web}`, `infra/compose/compose.ci.yml`; CI job `e2e-p15`; executable `just dod`; `algo_api.preview` (in-memory, local only) |
| Monorepo | pnpm 12 + Turborepo 2.11; uv workspace (Python 3.12); `justfile` facade |
| `apps/portal-web` | Next.js 15.5: catalog `/` (client search, status cards), landing `/p/<slug>` (`[[...path]]`, 404 for unknown slugs/sub-paths), `not-found`, `/api/health`, `app/icon.svg`; next-intl 4.14.9 without routing (`messages/ru.json`, typed keys); `middleware.ts` per-request CSP with nonce (all pages `force-dynamic`); static security headers in `next.config.ts` |
| `registry.ts` | 32 products with `tagline` (RU, own wording), `purpose` + `core` (verbatim from PROJECT_CATALOG.md, drift test), `tags` (7 i18n keys), profiles, status, wave |
| Waitlist | Form (client, no `name` attr, disabled until hydration) → `POST /api/v1/platform/waitlist` → `platform.waitlist` (Alembic `services/algo-api/migrations`, `0001`); always 202 (no enumeration); per-IP limits 5/min + 50/day checked before body parsing; body limit 16 KiB (413); 503 on DB failure; `just purge-waitlist` (365 days) |
| `python/shared_kernel` | + `ratelimit` (fixed window, O(1), Retry-After), `bodylimit` (pure ASGI 413), `errors.ErrorEnvelope`/`error_responses()`, `AppError.headers`, `Settings.max_body_bytes` |
| `packages/core`, `packages/ui` | unchanged in Phase 1 |
| Tests | e2e `apps/portal-web/e2e` (Playwright 1.65 + @axe-core/playwright): desktop 1280×800 + mobile 375×812 |
| CI | + job `e2e-smoke` (bundled Chromium `--with-deps`, report artifact on failure) |
| Docs | ARCHITECTURE_PLAN §5 rate-limit text, DEVOPS §1 (migrate/e2e), CHANGELOG |

## Commands (exact)

```bash
just setup                              # first time
just verify                             # lint + typecheck + unit + next build (no Docker)
just dod P15                            # executes the DoD; Docker checks print NOT RUN without Docker
just e2e                                # portal smoke; first run downloads Chromium
just e2e P15                            # P15 happy path vs docker compose (compose.ci.yml) — the MVP gate; needs Docker
just e2e-preview P15                    # same spec vs native in-memory stack (no Docker) — local smoke, not the gate
just preview                            # manual run: in-memory API :8000 + portal with ALGOHUB_FLAGS=preview:P15
just openapi                            # snapshot + @algohub/api-client types
just up && just migrate && just test-int   # needs Docker (platform migrations first, then products)
just purge P15 / just purge-waitlist    # retention; need a database
just index                              # PROJECT_INDEX.md from registry.ts
```

## Last verification (2026-11-15, branch `feat/portal-catalog`)

| Check | Command | Result |
|---|---|---|
| inspect (start, `087a954`) | `just lint` / `typecheck` / `test` | ✅ 4.9s / 2.2s / 15.6s — but **Turbo cache hit 8/8 masked CI failures** (index-sync typecheck + render test). Use `TURBO_FORCE=true` when comparing with CI |
| CI PR #8 / PR #7 before fixes | GitHub API, runs 43684736421 / 43685553693 | ❌ static (index-sync tsc: `--jsx` not set via registry → `@algohub/p15`), test-ts (render test expected P15 `NOT_STARTED`), dod P15 (same typecheck); ✅ test-py (first Postgres run of P15 integration), e2e-smoke, hygiene |
| fix `37ceef1` | `TURBO_FORCE=true just verify` | ✅ 40.8s — lint (import-linter 4/0), tsc 8/8 uncached, Vitest p15 56 · portal 58 · core 18 · dod 9 · gen 7 · api-client 5 · ui 4 · index-sync 2, pytest 221 passed / 97 deselected (11.2s), `next build` |
| contract | `uv run python -m algo_api.export_openapi --check` | ✅ 1s, up to date |
| e2e portal | `just e2e` | ✅ 22 passed, 2 skipped (21.5s) after landing tests moved to P31 |
| e2e P15 (preview) | `just e2e-preview P15` | ✅ 8 passed (11.7s) — not the gate |
| dod local | `just dod P15` | INCOMPLETE 25s: 11 ✅, 3 NOT RUN (integration, compose e2e, axe — **Docker not installed**) |
| integration local | `just test-int` | **NOT RUN: Docker not installed** (green in CI) |
| **CI `37ceef1`** | run 43686028535 | ✅ 6/6: static 48s, test-ts 48s, test-py 40s, e2e-smoke 82s, hygiene 4s, **dod P15 188s (step 141s) → GREEN** (exit 0 only on GREEN, `tools/dod/src/main.ts:92`; job log needs auth → not read) |
| **CI `d7f53db`** (MVP_READY, compose without preview flag) | run 43686736830 | ✅ 6/6: static 40s, test-ts 56s, test-py 45s, e2e-smoke 70s, hygiene 11s, **dod P15 182s → GREEN** |
| review | `reviewer` subagent | 0 blocker, 2 major (stale BUILD_STATE; gate had not run on `d7f53db` — now recorded above), 4 minor. Fixed in `c4b6011`: launched-status invariant covers VALIDATING, index-sync declares `@algohub/p15` + `@types/react`, STATUS names real CI integration command, `.env.example` dod check is existence-only (recorded, Phase 2.5) |
| after review | `TURBO_FORCE=true just lint` / `typecheck` / `test` | ✅ 4s / 6s / 18s; pytest 221 passed / 97 deselected; Vitest portal 58, index-sync 2 |
| CI on final HEAD | PR #7 | reported in the session handoff (docs + review-fix commits after `d7f53db`) |

### History: 2026-11-13 (local, branch `feat/p15-nomoredebate`)


| Check | Command | Result |
|---|---|---|
| inspect (start) | `just lint`, `just typecheck`, `just test` | ✅ 4s / 2s / 6s; pytest 60 passed, 9 deselected |
| CI of PR #7 | GitHub API (run 43386169678, `f174b99`) | ✅ 5/5 jobs (static, test-ts, test-py incl. integration, e2e-smoke, commit hygiene). Not merged |
| lint | `just lint` | ✅ 4s — ESLint 0, Prettier, ruff, import-linter **3 kept / 0 broken** (new: `algohub_p15` ↛ `algo_api`), index up to date |
| typecheck | `just typecheck` | ✅ 2s — tsc 8/8 packages, mypy --strict: shared_kernel, algorithms, algo-api, p15 api |
| unit (before review) | `just test` | ✅ 16s — Vitest 157; pytest 218 passed, 92 deselected; openapi up to date |
| algorithms | `uv run pytest python/algorithms` | ✅ 63 passed ~6.5s: oracle (exhaustive 3 options × ≤3 voters = 816 profiles/method + hypothesis ≤6×8), properties (monotonicity, neutrality, anonymity, determinism, IRV majority, Condorcet, Pareto, Condorcet loser), budget p95 < 25 ms at 50×10. 5/5 hand mutations killed |
| golden | `products/.../tests/test_scenarios_golden.py` | ✅ 7 scenarios via algorithm (exact incl. tie-break) and via HTTP |
| API | `products/.../tests/test_api.py` | ✅ authz matrix 5 endpoints × 4 credentials, validation (18 bodies), conflicts, idempotent PUT, lazy deadline, privacy of public responses, rate limits (429 + Retry-After, counted before parsing), 413 |
| contract fuzz | schemathesis 4.33.4 in-process | ✅ 9 operations, 40 examples each (300 also green): no 5xx, schema conformance, auth not skippable. Excluded: positive_data_acceptance (semantic rules), allow_header_conformance (platform gap) |
| build | `pnpm --filter @algohub/portal-web build` | ✅ ~16s, `/p/[slug]/[[...path]]` 1.58 kB |
| e2e portal | `just e2e` | ✅ 20 passed, 2 skipped, 20.3s (bundled Chromium) |
| e2e P15 (preview) | `just e2e-preview P15` | ✅ 8 passed, 7.2s — desktop+mobile, 2 scenarios, axe each screen, closed-room and no-token paths. **In-memory API, no images, no Postgres: not the DoD gate** |
| browser | `just preview`-equivalent + built-in browser | ✅ create → 3 votes → close → «Победил вариант «Sushi»»; keyboard ↑/↓ moves focus correctly; 375 px no horizontal scroll; 0 console errors |
| dod | `just dod P15` | **INCOMPLETE**, 24s — 11 ✅, 3 NOT RUN (integration, compose e2e, axe) |
| integration | `just test-int` (83 P15 + platform tests) | **NOT RUN: Docker is not installed** — first run in CI `test-py` |
| compose e2e | `just e2e P15` | **NOT RUN: Docker is not installed** — first run in CI `e2e-p15`; Dockerfiles/compose never built |
| CI | `actionlint` | ✅ no findings. GitHub run of this branch: NOT RUN (not pushed) |
| review | `reviewer` subagent ×1 | 0 blocker, 4 major, 9 minor. Fixed: NFC lengthening → 500 on Postgres (re-check after normalisation, tests on both stores), STATUS overclaim of integration, `algo_api.preview` importing a product (moved to `products.preview_mounts`, new import-linter contract → 4 kept), `COPY --chmod` for migrate, dod `maxBuffer`, CI job now runs the full `just dod P15`, PK/FK comparison in the schema test, composite FK ballot→participant's room, close-vs-ballot race test, participant-limit field in UI, organizer 403 message, result polling stops on 404, Tailwind scan narrowed to `products/*/web/src/**/*.tsx`. Recorded, not changed: slice size (3 separable commits), UI sends full rankings only |
| after fixes | `just lint` / `typecheck` / `test`, `just e2e-preview P15` | ✅ 3s / 5s / 17s — import-linter 4/0, pytest 221 passed / 97 deselected, Vitest 158 (p15 56, portal 58); e2e-preview 8 passed |

## Known gaps / assumptions

- P15 Postgres paths, migration 0001, `Dockerfile.{api,web}` and `compose.ci.yml` are verified **in CI only** (no Docker
  locally); they passed on the first CI run without changes.
- Local Turbo cache can replay stale green results (`just test`/`typecheck` showed green while CI was red): when local
  and CI disagree, rerun with `TURBO_FORCE=true`. Candidate for Phase 2.5: `inputs` in `turbo.json` / documented flag.
- `just dod` checks `.env.example` by existence only (not against `Settings` keys) — strengthen in Phase 2.5.
- GitHub job logs need auth; public API gives job/step conclusions + annotations only. `gh` is not logged in here.
- 405 responses list only the first matching route's methods in `Allow` (Starlette; GET and DELETE `/rooms/{id}` are
  separate routes) — schemathesis check excluded with a note; platform fix candidate for Phase 2.5.
- Product web packages type their own i18n keys (`products/*/web/src/i18n.ts`, `useT`) because the portal's global
  next-intl typing covers portal messages only; generator should emit this in Phase 2.5.
- `Dockerfile.api` lists each product's `pyproject.toml` explicitly for the dependency layer — generator must append.
- `just dod` recognises algorithm tests by file names (`test_*_<kind>.py|ts`) in the product or `python/algorithms/tests`.
- TESTING_STRATEGY §2.3 example `three_friends_pizza_tie` is not a tie (Sushi is the Condorcet winner) — fix the text in 2.5.
- Tailwind `@source` needs a file glob (`products/*/web/src/**/*.tsx`); a directory-only glob was silently ignored.

- **Pre-deploy (before any public URL):** schedule `just purge-waitlist` (worker in P31 or cron); deletion-on-request
  path for waitlist emails; operator identity + consent text for personal data (RK law); uvicorn `--proxy-headers`
  with strict `--forwarded-allow-ips` (else all users share one rate-limit bucket); hosting ADR.
- Rate limit is per process (no Redis by ADR); the in-house limiter replaced `slowapi` from the plan text (not an ADR).
- Waitlist accepts any catalog id regardless of status (landings exist only below MVP_READY anyway).
- Product texts (tagline/purpose) are RU strings in `registry.ts`; with a 2nd locale they move to `messages/<locale>.json`.
- TS waitlist client is still hand-written (guarded by `client.contract.test.ts`); could move to `@algohub/api-client`.
- pnpm `minimumReleaseAge` blocked next-intl 4.15.1 (1 day old) → pinned 4.14.9. `@swc/core`/`@parcel/watcher` build scripts denied (unused extractor).
- GitHub repo default branch is `chore/scaffold` (`origin/HEAD`); owner should switch it to `main` and enable protection.
- Docker absent → Postgres paths verified in CI only. Node 24 alongside Node 20 (docs/TOOLCHAIN.md).

## Next action

1. Owner: squash-merge **PR #7** (`feat/portal-catalog` → `main`; title e.g. `feat: portal catalog + P15 NoMoreDebate MVP`)
   once its CI on the final HEAD is green; delete `feat/portal-catalog` and the obsolete `feat/p15-nomoredebate`.
   Owner: switch the GitHub default branch to `main` and enable branch protection.
2. Phase 2.5 «retrospective → generator»: fold P15 lessons into `just gen` (product i18n typing, Dockerfile.api member
   list, compose preview flag, dod name conventions, Tailwind `@source`), fix TESTING_STRATEGY §2.3 example, 405 `Allow`,
   `.env.example` key check in dod, Turbo cache inputs.
3. Phase 3: P31 ShiftFair (SOLVER, CP-SAT) via the improved generator.
