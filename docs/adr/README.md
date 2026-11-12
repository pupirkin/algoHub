# Architecture Decision Records

Формат каждого ADR: контекст → варианты → решение → последствия → как откатить. Заголовки — English.
Изменение принятого решения — только новым ADR, который ссылается на заменяемый (`Superseded by`).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-monorepo-pnpm-turborepo-uv.md) | Monorepo: pnpm + Turborepo and uv workspaces | Accepted |
| [0002](0002-one-directory-per-product.md) | One directory per product | Accepted |
| [0003](0003-modular-monolith-two-deployables.md) | Modular monolith with two deployables and extraction triggers | Accepted |
| [0004](0004-product-profiles-single-language-algorithms.md) | Product profiles and single-language algorithms | Accepted |
| [0005](0005-postgres-schema-per-product.md) | Postgres schema per product, Alembic per product, no cross-schema FKs | Accepted |

Запланированы (ARCHITECTURE_PLAN §9): 0006 capability-токены, 0007 jobs в Postgres, 0008 OpenAPI-контракт,
0009 обязательный Provenance — создаются в фазах, где решение реализуется (DEVOPS §6).
