# Changelog (platform)

Изменения `packages/*`, `python/*`, `services/*`, `apps/portal-web`, `tools/*`, CI. Продуктовые изменения —
в `products/<id>/docs/CHANGELOG.md`. Формат — Keep a Changelog.

## [Unreleased]

### Added
- Фаза 1 «Портал»: `registry.ts` с tagline/purpose/core/tags для 32 продуктов (сверка с `PROJECT_CATALOG.md`
  тестом); каталог с клиентским поиском (AND по токенам, ё=е, грубый стемминг; fast-check свойства) и карточками
  статусов; лендинг `/p/<slug>` для статусов ниже `MVP_READY` с формой «Сообщить, когда готово»; `next-intl`
  (RU, типизированные ключи); security headers (CSP с nonce через middleware, HSTS, nosniff, Referrer-Policy,
  frame-ancestors); `POST /api/v1/platform/waitlist` + Alembic-миграция `platform.waitlist` + in-process
  rate limiter (`shared_kernel.ratelimit`); Playwright smoke + axe (desktop и 375×812), `just e2e`, CI job
  `e2e-smoke`; `just migrate` применяет платформенные миграции первыми; колонка Tagline в `PROJECT_INDEX.md`.
- Фаза 0 «Scaffold»: монорепо pnpm + Turborepo и uv workspace, `justfile`, compose с Postgres 16,
  `shared_kernel` (settings, logging, errors, health, db), `algo-api` с `/healthz` и `/readyz` и OpenAPI-снапшотом,
  `@algohub/core`, `@algohub/ui`, `portal-web` с главной и `/api/health`, `registry.ts` (32 продукта, NOT_STARTED),
  `PROJECT_INDEX.md` из registry, каркасы `gen-product` и `dod`, pre-commit, CI (static + test), `.claude/*`,
  ADR-0001…0005, `docs/TOOLCHAIN.md`.
