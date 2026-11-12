# AlgoHub — архитектурный план

Версия 1.0 · 2026-11-12 · Статус: принят как стартовая база. Изменения — только через ADR в `docs/adr/`.

Этот документ отвечает на вопрос «как устроена платформа», чтобы агент не изобретал структуру заново в каждой сессии. Что тестировать — в `TESTING_STRATEGY.md`, как запускать и вести процесс — в `DEVOPS_AND_WORKFLOW.md`, правила для агента — в `CLAUDE.md`.

---

## 1. Принятые решения (кратко)

| # | Решение | Выбор |
|---|---|---|
| D1 | Форма системы | Модульный монолит, microservice-ready. Два деплоя: `portal-web` (Next.js) и `algo-api` (FastAPI) + `algo-worker` (тот же образ, другой entrypoint) |
| D2 | Монорепо | pnpm workspaces + Turborepo (TS); uv workspace (Python). Одна команда `pnpm` для TS, `uv` для Python, `just` как единый фасад |
| D3 | Где живёт алгоритм | Определяется **профилем продукта** (§3). Каждый алгоритм реализован ровно в одном языке — без дублей TS/Python |
| D4 | Структура | Один каталог на продукт: `products/<id>-<slug>/{web,api,docs,scenarios}` (отклонение от мастер-промпта v1, см. ADR-0002) |
| D5 | Персистентность | Postgres 16, один инстанс в dev, **schema на продукт**, Alembic-миграции на продукт. Redis не вводится |
| D6 | Auth | Wave 1 — без регистрации. Комнаты и доступ через capability-токены. Абстракция `Principal` с первого дня, реализация (Auth.js / Supabase Auth) — когда дойдёт до SaaS-продуктов |
| D7 | Долгие вычисления | Async jobs: таблица `platform.jobs` + worker с `FOR UPDATE SKIP LOCKED`. API отвечает `202 + job_id`, клиент опрашивает |
| D8 | Контракты | FastAPI → OpenAPI → `openapi-typescript` → `@algohub/api-client`. Снапшот OpenAPI закоммичен, дрейф = падение CI |
| D9 | Честность данных | Любая внешняя/расчётная величина несёт `Provenance {source: "live" \| "demo" \| "user", fetched_at, confidence?}`. Тип обязателен, UI обязан показывать плашку для `demo` |
| D10 | Хостинг | Пока только локально. Всё контейнеризировано и 12-factor, чтобы деплой был сменой конфига, а не переделкой |
| D11 | Языки | Код, идентификаторы, коммиты, OpenAPI — English. Продуктовые документы (README/PRD/STATUS) — RU. UI: `next-intl`, ключи EN, контент RU; KZ/EN — когда появятся переводы |

---

## 2. Два деплоя и как из них вырастают сервисы

```
                 ┌──────────────────────────────┐
  browser ─────▶ │ portal-web (Next.js)         │  каталог, лендинги, UI всех продуктов,
                 │  app/p/[slug]/…              │  CLIENT-алгоритмы прямо в браузере
                 └──────────────┬───────────────┘
                                │ fetch /api/v1/<pid>/…  (typed client)
                 ┌──────────────▼───────────────┐
                 │ algo-api (FastAPI)           │  composition root: монтирует роутеры
                 │  /api/v1/p15/… /api/v1/p31/… │  всех продуктов, у которых есть api/
                 └──────┬───────────────┬───────┘
                        │               │ enqueue
                 ┌──────▼──────┐  ┌─────▼────────┐
                 │ Postgres    │  │ algo-worker  │  SOLVER-задачи (OR-Tools), фоновая
                 │ schema/prod │  │ (тот же код) │  очистка, retention
                 └─────────────┘  └──────────────┘
```

**Правило выделения сервиса.** Продукт выносится в отдельный процесс/контейнер только при одном из триггеров: (а) ему нужна другая версия тяжёлой зависимости (OR-Tools, torch), (б) его нагрузка мешает остальным, (в) нужен независимый релизный цикл для платящего клиента. Операция выделения — механическая: каталог `products/<id>/api` уже является самостоятельным Python-пакетом со своей schema и миграциями; создаётся новый composition root `services/<id>-api/main.py` в 20 строк, в портале меняется base URL. Фиксируется ADR.

---

## 3. Профили продуктов

Профиль определяет, где выполняется алгоритм, нужна ли база и какой набор тестов обязателен. Это уточнение трёх «ярусов» из обсуждения: оказалось, что P15 требует общего состояния (комната, голоса нескольких людей), поэтому ось «где считаем» и ось «есть ли общее состояние» разведены.

| Профиль | Алгоритм | Состояние | База | Пример |
|---|---|---|---|---|
| **CLIENT** | TypeScript в браузере (`web/src/algo/`) | только у пользователя: URL-state (сжатый) и/или localStorage | нет | P07 FairSplit, P17 FairTeams, P20 SubscriptionHunter, P22 RepairOrReplace |
| **ROOM** | Python на сервере (авторитетный расчёт) | общее: комната, участники, вклады | да, своя schema | P15 NoMoreDebate, P10 EatTogether, P05 FreeTogether, P13 WalkMatch |
| **SOLVER** | Python + OR-Tools, в worker, с таймаутом | задача → job → результат | да + `platform.jobs` | P31 ShiftFair, P28 SlotGenius, P32 AppointmentRescue, P02, P03, P26, P29, P30 |
| **DATA** | Python, за адаптерами внешних провайдеров | кэш ответов провайдера + Provenance | да | P01 Jinal, P04, P08, P09, P11, P14, P16, P18, P21, P23, P24, P25, P27, P06, P19, P12 |

Продукт может сочетать профили (P01 = DATA + ROOM: группа друзей и карты). Тогда действуют требования обоих.

### Классификация всех 32

| ID | Продукт | Профиль | Внешние данные | Wave |
|---|---|---|---|---|
| P01 | Jinal | DATA+ROOM | карты, матрица времени, места | 2 |
| P02 | OneWay | SOLVER+DATA | карты | — |
| P03 | TogetherRide | SOLVER+DATA | карты | — |
| P04 | GoNow | DATA | трафик, парковки | — |
| P05 | FreeTogether | ROOM | (календарь позже) | — |
| P06 | BasketBrain | DATA | цены магазинов | — |
| P07 | FairSplit | CLIENT | нет | 1.5 |
| P08 | LiveWhere | DATA | карты, аренда | — |
| P09 | ParkSmart | DATA | парковки | — |
| P10 | EatTogether | ROOM+DATA | заведения | — |
| P11 | QueueSwap | DATA | очереди/филиалы | — |
| P12 | LifeOptimizer | DATA | календарь | — |
| P13 | WalkMatch | ROOM | нет (гео по согласию) | — |
| P14 | FlightReady | DATA | рейсы, трафик | — |
| P15 | NoMoreDebate | ROOM | нет | **1** |
| P16 | PerfectWindow | DATA | погода | — |
| P17 | FairTeams | CLIENT | нет | 1.5 |
| P18 | PriceDNA | DATA | объявления | 3 |
| P19 | GroupBuy | SOLVER+DATA | поставщики | — |
| P20 | SubscriptionHunter | CLIENT | нет (файл обрабатывается локально — это и есть ценность) | 1.5 |
| P21 | DealOrWait | DATA | история цен | — |
| P22 | RepairOrReplace | CLIENT | нет (справочники в бандле) | 1.5 |
| P23 | QuietHome | DATA | шумовые карты/OSM | — |
| P24 | SunFlat | CLIENT→DATA | только геометрия → потом здания | 3 |
| P25 | RentRadar | DATA | аренда, карты | — |
| P26 | MoveOptimizer | SOLVER | нет | — |
| P27 | SafeWalk | DATA | OSM, освещение | — |
| P28 | SlotGenius | SOLVER | нет | 2 |
| P29 | CourierPool | SOLVER+DATA | карты | — |
| P30 | StockMind | SOLVER | данные клиента | 3 |
| P31 | ShiftFair | SOLVER | нет | **1** |
| P32 | AppointmentRescue | SOLVER | нет (интеграции позже) | 2 |

**Порядок:** P15 (ROOM) → P31 (SOLVER) → P01 (DATA). После них доказаны все три серверных профиля; CLIENT-профиль закрывается P07/P17 за одну–две сессии каждый («Wave 1.5» — дешёвые продукты, которые можно делать параллельно в worktree, пока идёт P01).

---

## 4. Структура репозитория

```text
algohub/
  apps/
    portal-web/                 # Next.js 15, App Router, единственное web-приложение
      app/
        (marketing)/            # главная, каталог, поиск
        p/[slug]/[[...path]]/   # точка входа продукта: компонент из registry или лендинг
        api/health/
      src/registry.ts           # ЕДИНСТВЕННЫЙ список продуктов → статус, профиль, loader
  services/
    algo-api/                   # composition root FastAPI: монтирует роутеры продуктов
    algo-worker/                # entrypoint воркера (импортирует те же пакеты)
  products/
    p15-nomoredebate/
      docs/                     # README, PRD, ARCHITECTURE, VALIDATION, STATUS, DECISIONS, CHANGELOG
      scenarios/                # golden-кейсы JSON: вход → ожидаемый результат (см. TESTING_STRATEGY)
      web/                      # pnpm-пакет @algohub/p15: UI, типы, (для CLIENT) algo/
      api/                      # uv-пакет algohub_p15: domain/, schemas/, router.py, migrations/
    p31-shiftfair/ …
  packages/                     # общий TS-код
    ui/                         # дизайн-система (shadcn/ui-based), токены, a11y-примитивы
    core/                       # Provenance, Result<T,E>, i18n helpers, url-state codec
    api-client/                 # сгенерированные типы + тонкий fetch-клиент
    config/                     # eslint, tsconfig, tailwind, prettier presets
  python/
    shared_kernel/              # settings, db session, jobs, logging, Principal, Provenance, errors
    algorithms/                 # переиспользуемые ядра: social_choice/, partition/, scheduling/, routing/
  infra/
    compose/                    # docker-compose.yml, compose.ci.yml
    docker/                     # Dockerfile.api, Dockerfile.web
  docs/
    adr/                        # 0001-…md
    architecture/               # этот файл (копия/ссылка), диаграммы
  tools/
    gen-product/                # pnpm gen:product P17 fairteams --profile CLIENT
    dod/                        # pnpm dod P15 — проверка Definition of Done
  .claude/                      # commands/, agents/, settings.json (см. DEVOPS_AND_WORKFLOW)
  .github/workflows/
  CLAUDE.md  AGENTS.md(→CLAUDE.md)  PROJECT_CATALOG.md  PROJECT_INDEX.md  BUILD_STATE.md
  justfile  package.json  pnpm-workspace.yaml  turbo.json  pyproject.toml  uv.lock
```

`pnpm-workspace.yaml`: `apps/*`, `packages/*`, `products/*/web`, `tools/*`.
`pyproject.toml` (uv workspace members): `services/*`, `python/*`, `products/*/api`.

### Правила границ (enforce'ятся линтерами, не договорённостями)

TypeScript (`eslint-plugin-boundaries`):
- `products/*/web` → может импортировать `@algohub/ui`, `@algohub/core`, `@algohub/api-client`. **Не может** импортировать другой продукт или `apps/portal-web`.
- `apps/portal-web` → импортирует продукты только через `src/registry.ts` с `dynamic()`-загрузкой (code splitting и изоляция падений).
- `packages/*` → не знают о продуктах.

Python (`import-linter`, contracts в `pyproject.toml`):
- `algohub_pXX` → `shared_kernel`, `algorithms`. **Запрещено** `algohub_pXX → algohub_pYY`.
- `algorithms` → чистые функции, без БД, без HTTP, без `settings`. Только stdlib, numpy, ortools.
- `shared_kernel` → не знает о продуктах.
- `services/algo-api` → единственное место, где перечислены все продукты.

---

## 5. Сквозные механизмы (shared_kernel / packages/core)

**Конфигурация.** `pydantic-settings`, один объект `Settings`, читается из env. `.env.example` без секретов. В Next.js — только `NEXT_PUBLIC_*` попадает в бандл; серверные ключи читаются в Route Handlers / Server Components. Lint-правило: `process.env.X` в клиентском коде без префикса — ошибка.

**Логирование и трассировка.** `structlog` JSON; middleware ставит `request_id` (принимает входящий `X-Request-ID`, иначе генерирует) и прокидывает в логи и ответ. В логах нет тел запросов и PII; список полей для редакции в `shared_kernel.logging`.

**Здоровье.** `GET /healthz` (процесс жив) и `GET /readyz` (БД доступна, миграции применены). У портала `/api/health`. Worker пишет heartbeat в `platform.worker_heartbeat`.

**Ошибки.** Единый формат `{error: {code, message, details?, request_id}}` (RFC 9457-подобный). Доменные ошибки — классы в `shared_kernel.errors`, маппинг в HTTP-статусы в одном месте. На клиенте — `Result<T, ApiError>`, никаких необработанных промисов в UI.

**Jobs (профиль SOLVER).**
```sql
platform.jobs(id uuid pk, product text, kind text, status text,  -- queued|running|done|failed|cancelled
              payload jsonb, result jsonb, error jsonb,
              attempts int, max_attempts int, timeout_s int,
              created_at, started_at, finished_at, idempotency_key text unique nullable)
```
Worker: `SELECT … FOR UPDATE SKIP LOCKED`, выполняет в подпроцессе с таймаутом; солвер обязан вернуть *лучшее найденное* решение по таймауту, а не упасть. `idempotency_key` защищает от повторной постановки при ретраях клиента. Переход на Redis/arq — только по измеренной необходимости (ADR).

**Principal и доступ.** `Principal = Anonymous | TokenHolder(scope, subject_id) | User(id)` — в wave 1 только первые два. Capability-токены: случайные 128-бит, в БД хранится хеш, передаются в заголовке `Authorization: Bearer`. У комнаты два токена: `organizer` и `participant`. Это даёт авторизацию без регистрации и без общих сессий.

**Provenance.** Поле обязательно в схемах всех DATA-ответов и всех расчётов, зависящих от внешних чисел. UI-компонент `<ProvenanceBadge>` в `@algohub/ui`; `demo` рендерится заметно. Тест в `packages/core` проверяет, что схемы DATA-продуктов содержат поле (структурная проверка OpenAPI-снапшота).

**Rate limiting и защита от злоупотреблений.** `slowapi` на write-эндпоинтах по IP; лимиты размеров тела; у ROOM-продуктов — лимит участников на комнату и комнат на IP в час. Security headers в `next.config` (CSP с nonce, HSTS, frame-ancestors). CORS — явный allowlist origin'ов.

**Retention.** Каждая schema продукта объявляет политику в `api/retention.py` (например, комнаты P15 — 30 дней после закрытия). Worker выполняет очистку ночью. Пользователь может удалить комнату organizer-токеном.

**Feature flags.** На старте — env-переменная `ALGOHUB_FLAGS=…` + `registry.ts` статусы. Без внешнего сервиса, пока нет пользователей.

**Аналитика для валидации.** Портал шлёт события (`product_view`, `notify_me`, `scenario_completed`) в self-hosted Umami (контейнер в compose) — опционально отключаемо, без cookies, без PII. Это превращает 32 лендинга в инструмент приоритизации.

---

## 6. Портал (Wave 0)

- `registry.ts` — единственный источник правды о продуктах: `{id, slug, title, tagline, profile, status, wave, tags, load?: () => import(…)}`. Генерируется из `PROJECT_INDEX.md`? **Нет** — наоборот: `PROJECT_INDEX.md` генерируется из `registry.ts` скриптом `pnpm index:sync`, чтобы не разъезжались.
- Карточка продукта в каталоге показывает статус честно (`NOT_STARTED … LIVE`). Для статусов ниже `MVP_READY` маршрут `/p/<slug>` рендерит лендинг: проблема, как будет работать, «Сообщить, когда готово» (email в `platform.waitlist`, double-opt-in не нужен до рассылок).
- Поиск — клиентский по registry (32 элемента; никакого бэкенда).
- Дизайн-система: `@algohub/ui` на базе shadcn/ui + Tailwind, токены в CSS variables, тёмная тема, фокус-кольца, `prefers-reduced-motion`. Mobile-first.
- i18n: `next-intl`, сообщения в `apps/portal-web/messages/ru.json`; продукты держат свои сообщения в `web/messages/`.

---

## 7. Первый срез: P15 NoMoreDebate (профиль ROOM)

**Ключевой сценарий (acceptance):** организатор создаёт комнату с вопросом и 2–10 вариантами → получает ссылку → 2–30 участников открывают её без регистрации, вводят имя и ранжируют варианты → организатор закрывает голосование (или наступает дедлайн) → все видят победителя и объяснение «почему», включая случаи ничьей.

**Алгоритмы (`python/algorithms/social_choice/`).** Чистые функции над `list[Ranking]`:
- `condorcet_winner()` — если существует, он и объявляется;
- `borda()` — основной метод по умолчанию (монотонный, объяснимый);
- `irv()` — опция «как на выборах»;
- `minimax_regret()` — опция из каталога: минимизируем максимальное «сожаление» участника;
- `explain(result)` — структурированное объяснение (попарные дуэли, баллы).
Детерминированный tie-break: хеш `room_id` → seed. Неполные ранжирования допустимы (невыставленные варианты делят последнее место).

**Модель данных (schema `p15`).**
```
rooms(id, title, question, method, status open|closed, deadline_at?, organizer_token_hash,
      max_participants, created_at, closed_at, delete_after)
options(id, room_id, label, position)
participants(id, room_id, display_name, token_hash, joined_at)
ballots(participant_id pk, room_id, ranking int[] /* option ids в порядке предпочтения */, updated_at)
results(room_id pk, computed_at, winner_option_id?, method, payload jsonb /* explain */)
```

**API `/api/v1/p15`** (все ответы с `request_id`):
```
POST   /rooms                         → 201 {room, organizer_token, share_url}
GET    /rooms/{id}                    → публичное состояние (без токенов, без чужих бюллетеней до закрытия)
POST   /rooms/{id}/participants       → {participant_token}  (лимит, уникальность имени)
PUT    /rooms/{id}/ballot             → Bearer participant_token; идемпотентно, перезаписывает
POST   /rooms/{id}/close              → Bearer organizer_token; вычисляет results
GET    /rooms/{id}/result             → 404 до закрытия
DELETE /rooms/{id}                    → Bearer organizer_token
```
Обновления на клиенте — polling каждые 3 с через `useRoom()`; SSE — отложено до измеренной нужды.

**UI (`products/p15-nomoredebate/web`).** Экраны: создание, комната участника (drag-and-drop ранжирование + доступный fallback кнопками ↑↓), экран организатора (кто проголосовал, кнопка закрыть), результат с объяснением. Пустые/loading/error состояния обязательны. Ранжирование сохраняется в localStorage до отправки.

**Нецели v1:** аккаунты, чат, комментарии, реальное время, push, интеграции с мессенджерами, более 50 участников.

**Критерии `MVP_READY`:** сценарий проходит Playwright-тестом против `docker compose up`; oracle- и property-тесты алгоритмов зелёные; `pnpm dod P15` зелёный; `docs/STATUS.md` и `VALIDATION.md` заполнены (гипотеза: ≥30 % созданных комнат доходят до закрытия с ≥3 участниками).

---

## 8. Что должно быть верно для P31 и P01 (чтобы шаблон не ломался)

**P31 ShiftFair (SOLVER).** Вход — JSON-спецификация: сотрудники, смены (дата, тип, нужное число людей, требуемые навыки), жёсткие ограничения (доступность, max часов/нед, min отдых, навыки), мягкие (равномерность ночей/выходных, пожелания) с весами. Модель CP-SAT в `algorithms/scheduling/shift_fair.py`, строгий таймаут из `Settings`. При невыполнимости — **объяснение**: какое ограничение ослабить (итеративная релаксация / assumptions CP-SAT), а не голое `INFEASIBLE`. Результат с метриками справедливости (разброс нагрузки, Джини по ночам). UI: загрузка/редактирование спецификации в таблицах, прогресс job, диаграмма расписания, экспорт CSV/ICS. Это первый продукт, который заставит появиться `platform.jobs` и worker — делать их в рамках P31, а не заранее.

**P01 Jinal (DATA+ROOM).** До первой строки кода — спайк `docs/SPIKE-maps-providers.md`: 2ГИС API vs OSRM/Valhalla на OSM (self-host) vs другие — цены, лимиты, лицензии, покрытие Казахстана, качество матрицы времени в Алматы/Астане. Интерфейс `MapsProvider { travel_time_matrix(origins, destinations, mode) ; places_nearby(point, category) ; geocode }` с реализациями `DemoProvider` (синтетика, помечена `demo`), `OsrmProvider`, `TwoGisProvider`. Ни один ключ не вводится до решения по бюджету (вопрос пользователю). Алгоритм: кандидаты (сетка/места) → минимакс времени в пути с мягкой суммарной компонентой → top-k с Pareto-фильтром. Приватность: участник делится точкой; другим показывается только агрегат; точка живёт столько же, сколько комната.

---

## 9. Черновики ADR (агент создаёт файлы в `docs/adr/` в первой сессии)

- **ADR-0001** Монорепо: pnpm+Turborepo и uv. Альтернатива Nx отклонена (тяжелее для смешанного стека); Poetry отклонён (медленнее, нет workspaces уровня uv).
- **ADR-0002** Один каталог на продукт `products/<id>/{web,api,docs}` вместо `apps/<id>-web` + `services/<id>-api`. Плюсы: один контекст для агента, выделение сервиса = перенос каталога. Минусы: workspace-globs глубже.
- **ADR-0003** Модульный монолит с двумя деплоями и триггерами выделения.
- **ADR-0004** Профили продуктов CLIENT/ROOM/SOLVER/DATA и правило «алгоритм в одном языке».
- **ADR-0005** Schema-per-product в Postgres, Alembic per product, никаких cross-schema FK.
- **ADR-0006** Capability-токены вместо auth в wave 1.
- **ADR-0007** Jobs в Postgres, без Redis.
- **ADR-0008** OpenAPI как контракт, генерация клиента, снапшот в репо.
- **ADR-0009** Provenance обязателен; `demo` видим пользователю.

Каждый ADR: контекст → варианты → решение → последствия → как откатить.

---

## 10. Известные риски архитектуры

| Риск | Смягчение |
|---|---|
| Next.js App Router + компоненты из пакетов: RSC/клиентские границы, транспиляция | `transpilePackages` в next.config; продукты экспортируют клиентские компоненты с `"use client"`; проверить на P15 в первой же сессии |
| OR-Tools тяжёлый (wheel ~ 20–30 МБ, время сборки образа) | отдельный слой в Dockerfile; устанавливается только в `algo-api/worker` образ; при росте — первый кандидат на выделение по триггеру (а) |
| Дрейф между `registry.ts`, `PROJECT_INDEX.md`, `STATUS.md` | `pnpm index:sync` генерирует индекс; `pnpm dod` сверяет статус в registry со STATUS.md |
| Агент «подрисовывает» демо-данные под реальные | тип `Provenance` обязателен в схемах + тест на OpenAPI-снапшот + плашка в UI |
| Один Postgres-инстанс станет точкой связности | schema-per-product и запрет cross-schema FK делают разнос по инстансам конфигурационным |
| Polling в ROOM-продуктах при росте | допустимо до сотен одновременных комнат; SSE — измерить и ввести ADR'ом |
