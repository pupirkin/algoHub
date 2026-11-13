# P15 NoMoreDebate — STATUS

Status: IN_PROGRESS
Updated: 2026-11-13
Branch: `feat/p15-nomoredebate` (stacked on `feat/portal-catalog`, PR #7 not merged yet)

## Acceptance criteria (MVP_READY, ARCHITECTURE_PLAN §7 + TESTING_STRATEGY §7)
- [x] Алгоритмы (`social_choice`): oracle, property, golden, budget — зелёные.
- [x] Schema `p15` + Alembic-миграция `0001`; модель ↔ миграция, нет cross-schema FK (тест, integration).
- [x] API `/api/v1/p15`: валидация, authz-матрица, лимиты, идемпотентность `PUT /ballot`, дедлайн, приватность.
- [x] Контракт: `openapi.json` обновлён; schemathesis без 5xx и с соответствием схеме.
- [ ] `@algohub/api-client` сгенерирован, дрейф проверяется.
- [ ] UI: 4 экрана (создание, комната участника, организатор, результат), пустые/loading/error состояния.
- [ ] Портал: `/p/nomoredebate/...` грузит продукт через `registry.load()`.
- [ ] `compose.ci.yml` + Dockerfile'ы; Playwright happy path по `scenarios/*.json` против compose; axe чисто.
- [ ] Интеграция с реальным Postgres зелёная (`just test-int` / CI `test-py`).
- [ ] `just dod P15` = GREEN.

## Assumptions
- Нет Docker и Postgres на машине разработки (2026-11-13): интеграционные тесты и e2e против compose впервые
  выполняются в CI; локально — NOT RUN.
- Комнаты без активности закрываются лениво; комната, которую никто не открыл после дедлайна, остаётся `open`
  до удаления по retention (30 дней от создания).
- Лимиты на IP — на процесс (как у waitlist); за прокси нужен `--proxy-headers` (BUILD_STATE, pre-deploy).
- Имена участников видит только организатор; публично — только счётчики.

## Known bugs
- none (известные пробелы платформы — в BUILD_STATE: 405 `Allow` у Starlette).
