# BUILD_STATE

- Updated: 2026-11-13
- Phase: **1 «Портал» — done on branch `feat/portal-catalog`** (from `main` @ `e13be36`), PR pending merge.
  Next: **Phase 2 «P15 NoMoreDebate»** (DEVOPS_AND_WORKFLOW.md §6).
- Commit: see `git log -1` on `feat/portal-catalog`. Merge = squash; PR title `feat(portal): catalog, landings and waitlist`.
- Products: 32 in registry, all `NOT_STARTED`; `products/` is still empty. Sessions without changes in `products/`: 2
  (Phase 0, Phase 1 — both platform phases by roadmap). Phase 2 must land product code.

## What exists

| Area | State |
|---|---|
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
just e2e                                # portal smoke; first run downloads Chromium
E2E_BROWSER_CHANNEL=chrome just e2e     # same, on installed Google Chrome (no download)
just up && just migrate && just test-int   # needs Docker (platform migrations run first)
just purge-waitlist                     # needs a database
just index                              # PROJECT_INDEX.md from registry.ts
```

## Last verification (2026-11-13, macOS arm64, local)

| Check | Command | Result |
|---|---|---|
| inspect (start) | `just lint`, `just typecheck`, `just test` | ✅ 3.7s / 1.9s / 5.9s; pytest 32 passed |
| all-in-one | `just verify` | ✅ 25.4s — ESLint 0 problems, Prettier, ruff, import-linter 2 kept / 0 broken, index up to date; tsc 6/6, mypy --strict 16+1+16 files; Vitest 92 (portal-web 55, core 18, gen-product 7, dod 6, ui 4, index-sync 1); pytest **60 passed, 9 deselected** (integration) 2.47s; openapi up to date; `next build` ok (all routes ƒ dynamic, middleware 34 kB) |
| e2e | `E2E_BROWSER_CHANNEL=chrome just e2e` | ✅ **20 passed, 2 skipped** (desktop-only checks), 27s, Google Chrome 157. A previous run had 2 mobile `browser.newContext` timeouts while a Chromium download loaded the machine; rerun clean |
| e2e on bundled Chromium | `just e2e` (headless shell 1254, same as CI) | ✅ **20 passed, 2 skipped**, 21.4s. Also `E2E_BROWSER_CHANNEL=chromium` (full Chromium 1254): ✅ 20/2, 37.6s |
| e2e coverage | — | headers (CSP nonce/`strict-dynamic`, no `unsafe-inline`, frame-ancestors, HSTS, nosniff, Referrer-Policy), 32 cards «Не начат», search (count, empty, reset), skip link + focus, card → landing, axe serious/critical = 0 on home/search/landing/waitlist states, console errors = 0, 404s, no-JS submit leaks nothing to URL, bundle has no server env names/values. **Waitlist submissions intercept the API in-browser (`page.route`) — not end-to-end** |
| browser | `next start` + built-in browser | ✅ catalog renders, search hydrates under CSP, 0 console messages |
| API in real Postgres | `just test-int` (incl. migrations up/down/up, model↔DB schema, no cross-schema FK, dedupe, CHECKs, purge) | **NOT RUN: Docker is not installed** — first execution is CI `test-py` |
| migrations | `just migrate` | **NOT RUN: Docker**. Without DB: `alembic history` shows `0001 (head)`; `upgrade` fails only on connect (expected) |
| CI | `actionlint` | ✅ no findings. GitHub run: NOT RUN yet (gh not authenticated; PR opened by owner) |
| review | `reviewer` subagent ×2 | pass 1: 4 major + 12 minor; pass 2: 2 major (integration asserts: BIGINT type name, unique-constraint index) + 3 minor (chunked body → 400 instead of 413, docs/.env.example, no-JS test wait) — all fixed (email-in-URL pre-hydration, body limit + limiter before parsing, retention promise backed by purge, BUILD_STATE honesty, Retry-After, OpenAPI error envelope, O(1) limiter, focus/announce, schema check, Unicode length, 422 mapping, turbo inputs, bundle leak test, plan text) |
| umami | — | **Deferred** (needs Docker container; not in this session's budget) |

## Known gaps / assumptions

- **Pre-deploy (before any public URL):** schedule `just purge-waitlist` (worker in P31 or cron); deletion-on-request
  path for waitlist emails; operator identity + consent text for personal data (RK law); uvicorn `--proxy-headers`
  with strict `--forwarded-allow-ips` (else all users share one rate-limit bucket); hosting ADR.
- Rate limit is per process (no Redis by ADR); the in-house limiter replaced `slowapi` from the plan text (not an ADR).
- Waitlist accepts any catalog id regardless of status (landings exist only below MVP_READY anyway).
- Product texts (tagline/purpose) are RU strings in `registry.ts`; with a 2nd locale they move to `messages/<locale>.json`.
- TS waitlist client is hand-written, guarded by `client.contract.test.ts` vs `openapi.json`; `@algohub/api-client` → Phase 2.
- `/p/<slug>` for a launched product currently 404s (none exist); P15 adds the `registry.load()` branch.
- pnpm `minimumReleaseAge` blocked next-intl 4.15.1 (1 day old) → pinned 4.14.9. `@swc/core`/`@parcel/watcher` build scripts denied (unused extractor).
- GitHub repo default branch is `chore/scaffold` (`origin/HEAD`); owner should switch it to `main` and enable protection.
- Docker absent → Postgres paths verified in CI only. Node 24 alongside Node 20 (docs/TOOLCHAIN.md).

## Next action

Phase 2 «P15 NoMoreDebate» per ARCHITECTURE_PLAN §7: `just gen P15 nomoredebate --profile ROOM`, algorithms
(ranked choice / minimax regret) with oracle + property tests, schema `p15` + migrations, API + contract +
schemathesis, `@algohub/api-client`, 4 UI screens, `compose.ci.yml` + Dockerfiles for e2e against compose, `dod P15` green.
