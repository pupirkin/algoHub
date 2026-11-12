# Changelog (platform)

Изменения `packages/*`, `python/*`, `services/*`, `apps/portal-web`, `tools/*`, CI. Продуктовые изменения —
в `products/<id>/docs/CHANGELOG.md`. Формат — Keep a Changelog.

## [Unreleased]

### Added
- Фаза 0 «Scaffold»: монорепо pnpm + Turborepo и uv workspace, `justfile`, compose с Postgres 16,
  `shared_kernel` (settings, logging, errors, health, db), `algo-api` с `/healthz` и `/readyz` и OpenAPI-снапшотом,
  `@algohub/core`, `@algohub/ui`, `portal-web` с главной и `/api/health`, `registry.ts` (32 продукта, NOT_STARTED),
  `PROJECT_INDEX.md` из registry, каркасы `gen-product` и `dod`, pre-commit, CI (static + test), `.claude/*`,
  ADR-0001…0005, `docs/TOOLCHAIN.md`.
