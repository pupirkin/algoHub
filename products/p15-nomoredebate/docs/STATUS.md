# P15 NoMoreDebate — STATUS

Status: IN_PROGRESS
Updated: 2026-11-13
Branch: `feat/p15-nomoredebate` (stacked on `feat/portal-catalog`, PR #7 not merged yet)

## Acceptance criteria (MVP_READY, ARCHITECTURE_PLAN §7 + TESTING_STRATEGY §7)
- [x] Алгоритмы (`social_choice`): oracle, property, golden, budget — зелёные.
- [x] Schema `p15` + Alembic-миграция `0001`; модель ↔ миграция, нет cross-schema FK (тест, integration).
- [x] API `/api/v1/p15`: валидация, authz-матрица, лимиты, идемпотентность `PUT /ballot`, дедлайн, приватность.
- [x] Контракт: `openapi.json` обновлён; schemathesis без 5xx и с соответствием схеме.
- [x] `@algohub/api-client` сгенерирован, дрейф проверяется.
- [x] UI: 4 экрана (создание, комната участника, организатор, результат), пустые/loading/error состояния.
- [x] Портал: `/p/nomoredebate/...` грузит продукт через `registry.load()` (до MVP_READY — только с `ALGOHUB_FLAGS=preview:P15`).
- [~] `compose.ci.yml` + Dockerfile'ы и Playwright happy path написаны; против preview-стека 8/8 (desktop+mobile, axe);
      **против compose — NOT RUN локально (нет Docker)**, первый прогон — CI `e2e-p15`.
- [ ] Интеграция с реальным Postgres зелёная (`just test-int` / CI `test-py`) — 83 теста написаны, NOT RUN локально.
- [ ] `just dod P15` = GREEN (сейчас INCOMPLETE: 11 ✅, 3 NOT RUN — интеграция, e2e vs compose, axe).

## Assumptions
- Нет Docker и Postgres на машине разработки (2026-11-13): интеграционные тесты и e2e против compose впервые
  выполняются в CI; локально — NOT RUN.
- Комнаты без активности закрываются лениво; комната, которую никто не открыл после дедлайна, остаётся `open`
  до удаления по retention (30 дней от создания).
- Лимиты на IP — на процесс (как у waitlist); за прокси нужен `--proxy-headers` (BUILD_STATE, pre-deploy).
- Имена участников видит только организатор; публично — только счётчики.

## Verification log
- 2026-11-13 `just dod P15` → INCOMPLETE (24 s): статика, тесты продукта, наборы алгоритмов, контракт — ✅;
  интеграция/e2e/axe — NOT RUN (нет Docker).
- 2026-11-13 `just e2e-preview P15` → 8 passed (7.2 s) — не засчитывается в DoD (in-memory, без образов и Postgres).
- 2026-11-13 ручной прогон в браузере (preview): создание → 3 голоса → закрытие → «Победил вариант «Sushi»»,
  375 px без горизонтального скролла, 0 ошибок консоли.

## Known bugs
- none (известные пробелы платформы — в BUILD_STATE: 405 `Allow` у Starlette).
