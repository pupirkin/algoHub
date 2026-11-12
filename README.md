# AlgoHub

Монорепозиторий платформы из 32 небольших алгоритмических веб-продуктов: портал (Next.js 15), общий API (FastAPI),
Postgres 16 (schema на продукт). Правила для агентов — [CLAUDE.md](CLAUDE.md); текущее состояние — [BUILD_STATE.md](BUILD_STATE.md);
каталог продуктов — [PROJECT_INDEX.md](PROJECT_INDEX.md) (генерируется из `apps/portal-web/src/registry.ts`).

## Быстрый старт

Нужны: Node ≥ 22.12 (24 LTS), pnpm 12, uv, just, Docker (для Postgres). Версии и отклонения — [docs/TOOLCHAIN.md](docs/TOOLCHAIN.md).

```bash
just setup   # pnpm install, uv sync, git hooks, .env из .env.example
just up      # Postgres 16 в Docker + миграции
just dev     # портал http://localhost:3000 и API http://127.0.0.1:8000 (/healthz, /readyz, /docs)
just test    # unit + property тесты TS и Python + проверка OpenAPI-снапшота
```

Все команды: `just --list`. Описание процесса и фаз — [DEVOPS_AND_WORKFLOW.md](DEVOPS_AND_WORKFLOW.md),
архитектура — [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md), тестирование — [TESTING_STRATEGY.md](TESTING_STRATEGY.md),
решения — [docs/adr/](docs/adr/).

## Структура

```text
apps/portal-web        Next.js 15 App Router — единственное web-приложение, src/registry.ts — список продуктов
services/algo-api      FastAPI composition root: /healthz, /readyz, /api/v1/<pid>/…; openapi.json — контракт
packages/core          Result, Provenance, словарь статусов/профилей
packages/ui            дизайн-система (shadcn/ui-подход, Tailwind v4): Button, Input, Card, Badge, PageShell
packages/config        tsconfig-пресеты
python/shared_kernel   settings, logging (structlog + редакция PII), errors, health, db
python/algorithms      чистые алгоритмические ядра (появляются с продуктами)
products/<id>-<slug>/  web, api, docs, scenarios — по каталогу на продукт (пока пусто)
tools/                 gen-product, dod, index-sync, hooks
infra/compose          docker-compose.yml (Postgres), init SQL
```
