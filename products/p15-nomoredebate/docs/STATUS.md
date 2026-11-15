# P15 NoMoreDebate — STATUS

Status: MVP_READY
Updated: 2026-11-15
Branch: `feat/portal-catalog` (PR #7 → `main`; PR #8 `feat/p15-nomoredebate` был squash-слит в эту ветку)

## Acceptance criteria (MVP_READY, ARCHITECTURE_PLAN §7 + TESTING_STRATEGY §7)
- [x] Алгоритмы (`social_choice`): oracle, property, golden, budget — зелёные.
- [x] Schema `p15` + Alembic-миграция `0001`; тесты «модель ↔ миграция», «нет cross-schema FK», гонки и
      retention на Postgres 16 — зелёные в CI `test-py` (локально NOT RUN: нет Docker).
- [x] API `/api/v1/p15`: валидация, authz-матрица, лимиты, идемпотентность `PUT /ballot`, дедлайн, приватность.
- [x] Контракт: `openapi.json` обновлён; schemathesis без 5xx и с соответствием схеме.
- [x] `@algohub/api-client` сгенерирован, дрейф проверяется.
- [x] UI: 4 экрана (создание, комната участника, организатор, результат), пустые/loading/error состояния.
- [x] Портал: `/p/nomoredebate/...` грузит продукт через `registry.load()` (до MVP_READY — только с `ALGOHUB_FLAGS=preview:P15`).
- [x] Playwright happy path (desktop + mobile, axe на каждом экране) против `compose.ci.yml` (образы api/web,
      Postgres 16, миграции) — зелёный в CI job `dod P15`.
- [x] Интеграция с реальным Postgres зелёная: CI `test-py` (`uv run pytest -m integration` против service
      container Postgres 16) и `just test-int` внутри `just dod P15`.
- [x] `just dod P15` = GREEN в CI (run 43686028535, commit `37ceef1`, job `dod P15` 188 с; `just dod` выходит с 0
      только при GREEN — `tools/dod/src/main.ts`). Локально INCOMPLETE (11 ✅, 3 NOT RUN — нет Docker).

## Assumptions
- Нет Docker и Postgres на машине разработки (2026-11-13): интеграционные тесты и e2e против compose
  выполняются в CI; локально — NOT RUN. Доказательство GREEN — код выхода CI job: лог job через публичный API
  без авторизации недоступен (403).
- Комнаты без активности закрываются лениво; комната, которую никто не открыл после дедлайна, остаётся `open`
  до удаления по retention (30 дней от создания).
- Лимиты на IP — на процесс (как у waitlist); за прокси нужен `--proxy-headers` (BUILD_STATE, pre-deploy).
- Имена участников видит только организатор; публично — только счётчики.
- UI отправляет полное ранжирование (все варианты по порядку); API и алгоритмы принимают и неполные бюллетени
  (PRD) — неполные приходят только через API. Режим «выставить не все» в UI — кандидат после валидации.
- Размер среза превышает ориентир ~600 строк (CLAUDE.md rule 1): ветка содержит 3 самостоятельных коммита
  (алгоритм + API; UI + клиент; инфраструктура + e2e + dod). Если владельцу удобнее — PR по одному на коммит.

## Verification log
- 2026-11-15 CI run 43686028535 (`37ceef1`, PR #7): 6/6 jobs ✅ — static 48 s, test-ts 48 s, test-py (Postgres 16)
  40 s, e2e-smoke 82 s, commit hygiene 4 s, **dod P15 188 s (шаг `just dod P15` 141 s) → GREEN** → статус `MVP_READY`.
- 2026-11-15 локально `just verify` без кэша Turbo ✅ (40.8 s): Vitest p15 56, pytest 221 passed / 97 deselected;
  `just dod P15` → INCOMPLETE (22 s, нет Docker).
- 2026-11-13 `just dod P15` → INCOMPLETE (24 s): статика, тесты продукта, наборы алгоритмов, контракт — ✅;
  интеграция/e2e/axe — NOT RUN (нет Docker).
- 2026-11-13 после ревью: pytest 221 passed / 97 deselected (11.3 s), Vitest p15 56; `just e2e-preview P15` → 8 passed (7.9 s) — не засчитывается в DoD (in-memory, без образов и Postgres).
- 2026-11-13 ручной прогон в браузере (preview): создание → 3 голоса → закрытие → «Победил вариант «Sushi»»,
  375 px без горизонтального скролла, 0 ошибок консоли.

- DoD-пункт «`.env.example` актуален» `just dod` проверяет только по наличию файла (`checkEnvExample`), а не по
  ключам `Settings`; сверено вручную 2026-11-15 — у P15 нет собственных env-переменных. Усиление — Фаза 2.5.

## Known bugs
- none (известные пробелы платформы — в BUILD_STATE: 405 `Allow` у Starlette).
