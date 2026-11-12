# ADR-0002: One directory per product

- Status: Accepted
- Date: 2026-11-12
- Отклонение от мастер-промпта v1 (`apps/<id>-web` + `services/<id>-api`, 64 приложения/сервиса).

## Контекст
Продукт — bounded context со своим UI, доменом, контрактом, тестами, документами и schema в Postgres.
Агент работает с одним продуктом за срез и должен видеть весь его контекст в одном месте.

## Варианты
1. **`products/<id>-<slug>/{web,api,docs,scenarios}`** — всё о продукте в одном каталоге.
2. `apps/<id>-web` + `services/<id>-api` (v1) — 64 развёртываемых единицы, контекст размазан по дереву.
3. Один пакет на продукт со смешанными TS/Python-файлами — ломает инструменты обоих языков.

## Решение
Вариант 1. `web/` — pnpm-пакет `@algohub/pXX`, `api/` — uv-пакет `algohub_pXX`, `docs/` — 7 документов
продукта, `scenarios/` — golden-кейсы JSON. Генератор: `just gen <ID> <slug> --profile <P>`.

## Последствия
- Плюсы: один контекст для агента; выделение сервиса = перенос каталога + новый composition root.
- Минусы: workspace-глобы глубже (`products/*/web`, `products/*/api`); границы между продуктами обеспечиваются
  линтерами (`eslint-plugin-boundaries`, `import-linter`), а не раскладкой каталогов.

## Как откатить
Механический перенос `products/<id>/web` → `apps/<id>-web` и `products/<id>/api` → `services/<id>-api`
с правкой workspace-глобов; код пакетов не меняется.
