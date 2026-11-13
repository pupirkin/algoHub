# AlgoHub — DevOps, рабочий процесс агента и роадмап

Версия 1.0 · 2026-11-12. Хостинг отложен (решение: пока только локально), поэтому раздел деплоя описывает *готовность* к нему, а не сам деплой.

---

## 1. Локальная среда

**Единый фасад — `justfile`** (чтобы агенту не держать в голове два тулчейна):
```
just setup        # pnpm install, uv sync, pre-commit install, cp .env.example .env (если нет)
just up           # docker compose up -d postgres umami; миграции всех продуктов
just dev          # turbo dev (portal-web) + uvicorn algo-api --reload + worker  (concurrently)
just test [ID]    # все тесты или тесты продукта
just e2e [ID]     # поднимает compose.ci, гоняет Playwright, гасит
just dod ID       # Definition of Done
just gen ID slug --profile CLIENT|ROOM|SOLVER|DATA
just index        # регенерировать PROJECT_INDEX.md из registry.ts
just checkpoint   # lint+typecheck+unit быстрый профиль → обновить BUILD_STATE.md → git add -A && git commit
```

Добавлено в Фазе 0 (2026-11-12), чтобы у каждой проверки была одна точка входа:
```
just down         # остановить compose (volume с данными сохраняется)
just migrate      # alembic upgrade head для каждого products/*/api/alembic.ini (вызывается из just up)
just lint         # ESLint(+boundaries,+jsx-a11y), Prettier, ruff, import-linter, дрейф PROJECT_INDEX.md
just typecheck    # tsc strict во всех TS-пакетах + mypy --strict по каждому uv-члену
just test-int     # интеграционные pytest -m integration против tmpfs postgres-test (профиль compose "test")
just openapi      # перегенерировать services/algo-api/openapi.json
just verify       # lint + typecheck + test + next build — всё, что CI делает без Docker
```
Фактическое состояние Фазы 0: `just up` поднимает только `postgres` (umami — Фаза 1, algo-api/portal-web в контейнерах и
`compose.ci.yml` — с первым e2e); `just dev` запускает портал и API без worker (worker появляется в P31);
`just e2e` честно печатает NOT RUN, пока нет Playwright-набора (Фаза 1); `just checkpoint` гоняет быстрый профиль
`lint + typecheck + test` (без `next build`, который есть в `just verify`). Уточнение к абзацу о compose ниже: init-скрипт
создаёт только schema `platform`; schema продукта создаёт его собственная первая Alembic-миграция (ADR-0005), а
`services/algo-api/src/algo_api/products.py` лишь называет её.

Фаза 1 (2026-11-13): `just migrate` сначала применяет платформенные миграции (`services/algo-api/alembic.ini`,
schema `platform`, version table `platform.alembic_version`), затем миграции продуктов. `just e2e` (без ID) —
портальный smoke: Playwright против `next build && next start` на :3100, проекты desktop и mobile (375×812), axe
serious/critical, проверка security headers; API в браузере перехватывается (`page.route`) — это помечено в тестах.
Первый запуск скачивает Chromium (`playwright install chromium`). `just e2e P15` честно печатает NOT RUN, пока нет
`compose.ci.yml` и Dockerfile'ов (Фаза 2). CI: job `e2e-smoke`. `E2E_BROWSER_CHANNEL=chrome just e2e` — то же на
установленном Google Chrome без скачивания Chromium. `just purge-waitlist` — удаляет записи `platform.waitlist`
старше 365 дней (нужна БД; до появления worker в P31 запускается вручную/cron).

**Docker Compose** (`infra/compose/docker-compose.yml`): `postgres:16` (с init-скриптом, создающим schemas `platform`, и по одной на продукт — из списка в `services/algo-api/products.py`), `umami` (аналитика, опционально, профиль `analytics`), `algo-api`, `algo-worker`, `portal-web` (в dev фронт обычно запускается нативно ради HMR; в compose — для e2e). `compose.ci.yml` — те же сервисы с фиксированными портами и `healthcheck`, на которые ждёт Playwright.

**Образы.** `Dockerfile.api` многоэтапный: `uv sync --frozen` в builder, слой OR-Tools отдельно (кэш), runtime на `python:3.12-slim`, non-root user, `HEALTHCHECK /healthz`. `Dockerfile.web` — `next build` standalone output. Оба образа — один и тот же для dev/CI/будущего прод, различие только в env.

**Конфигурация.** `.env.example` в корне и в каждом `products/<id>/api` (только свои переменные), без значений-секретов. `Settings` валидирует при старте и падает с понятным сообщением, если чего-то нет.

**Python.** `uv` workspace, `uv run` для всего; виртуалка одна на репо. `pre-commit`: ruff, mypy (изменённые файлы), gitleaks, prettier, eslint — быстро (< 20 с), иначе агент начнёт обходить.

---

## 2. Ветвление, коммиты, релизы

- Trunk-based: `main` всегда зелёный и запускаемый `just up && just dev`. Ветки короткие: `feat/p15-rooms-api`, `chore/ci-cache`, `adr/0007-jobs`. Один PR = один вертикальный срез (≤ ~600 строк диффа без сгенерированного кода; больше — дробить).
- Conventional Commits с областью продукта: `feat(p15): close room and compute borda result`. Squash-merge в `main`.
- **Атрибуция:** коммиты и пуши только от аккаунта владельца репозитория. Никаких `Co-Authored-By`, упоминаний агента или инструментов в сообщениях коммитов и PR. В `.claude/settings.json` — `"includeCoAuthoredBy": false`; в CI — проверка `commit-msg` на отсутствие trailer'ов `Co-Authored-By`.
- Changelog: `products/<id>/docs/CHANGELOG.md` (Keep a Changelog) обновляется в том же PR. Платформенный `CHANGELOG.md` в корне — для `packages/*`, `python/*`, `apps/portal-web`. Теги версий не нужны до первого внешнего пользователя.
- Dependabot/Renovate: еженедельно, группами (`minor+patch` одним PR), мажоры отдельно; auto-merge только для dev-зависимостей при зелёном CI.

---

## 3. CI (GitHub Actions)

`ci.yml` на `pull_request` и `push: main`:
1. `setup` — pnpm store cache, uv cache, `turbo` remote cache не нужен (GitHub cache по хешу lockfile достаточно).
2. `affected` — вычисляет затронутые TS-пакеты (`turbo run … --filter=...[origin/main]`) и Python-пакеты (`dorny/paths-filter` по `products/*/api`, `python/**`, `services/**`); выдаёт матрицу.
3. `static` — lint, typecheck, import-linter, knip, gitleaks, dependency-review.
4. `test-ts` / `test-py` — по матрице; Python с сервисом `postgres` в job.
5. `contract` — регенерация OpenAPI-снапшота и `api-client`, `git diff --exit-code`; schemathesis быстрый профиль.
6. `e2e` — `docker compose -f compose.ci.yml up --wait`, Playwright для затронутых продуктов + smoke портала; артефакты (trace, видео) при падении.
7. `dod-report` — `just dod` для затронутых продуктов, результат в комментарий PR (информативно; блокирует только попытка поднять статус без права).

`nightly.yml` — полный прогон с длинными профилями (см. TESTING_STRATEGY §8). `images.yml` — сборка образов и `trivy` скан на `main` (публикация в GHCR можно включить позже одним флагом).

Время PR-пайплайна держать < 10 минут; если дольше — сначала кэш и параллелизм, потом урезать.

---

## 4. Готовность к деплою (без самого деплоя)

Сделать сейчас, чтобы потом деплой занял вечер:
- 12-factor: вся конфигурация через env; нет записи на локальный диск кроме `/tmp`; логи в stdout JSON.
- `/healthz`, `/readyz`, graceful shutdown (uvicorn handles SIGTERM; worker дорабатывает текущую задачу или возвращает её в `queued`).
- Миграции — отдельный шаг (`just migrate`), не при старте процесса.
- Бэкапы: `pg_dump` скрипт в `infra/scripts/` и восстановление протестированы локально (одна команда туда, одна обратно).
- Один `docker-compose.prod.yml` с Caddy (TLS) рядом — чтобы вариант «всё на одном VPS» был запускаем в любой момент; вариант Vercel + VPS описан в `docs/architecture/deployment-options.md` с ценами на дату.
- Решение о хостинге и о том, где физически лежат данные (вопрос локализации персональных данных по законодательству РК актуален, как только появятся имена/гео реальных людей), фиксируется ADR перед `LIVE` первого продукта.

---

## 5. Работа через Claude Code (Opus, длинные автономные сессии)

### 5.1 Файлы в репо
```
CLAUDE.md                      # правила репо (см. отдельный файл); AGENTS.md → одна строка «см. CLAUDE.md»
.claude/
  settings.json                # права, атрибуция, hooks
  commands/
    inspect.md                 # /inspect — восстановить контекст
    slice.md                   # /slice <описание> — спланировать и реализовать один срез
    verify.md                  # /verify [ID] — прогнать полный набор проверок и честно отчитаться
    checkpoint.md              # /checkpoint — BUILD_STATE + коммит
    new-product.md             # /new-product P17 fairteams CLIENT
    handoff.md                 # /handoff — NEXT SESSION PROMPT + финальный чекпоинт
  agents/
    reviewer.md                # read-only: ревью диффа против CLAUDE.md, DoD, границ; не правит код
    algo-tester.md             # пишет oracle/property/golden тесты для указанного алгоритма
    spike.md                   # исследовательский: провайдеры, библиотеки, лицензии → docs/SPIKE-*.md
```

### 5.2 `.claude/settings.json` (ориентир; агент сверяет формат с актуальной документацией Claude Code в первой сессии)
```json
{
  "includeCoAuthoredBy": false,
  "permissions": {
    "allow": [
      "Bash(pnpm *)", "Bash(uv *)", "Bash(just *)", "Bash(pytest *)", "Bash(npx playwright *)",
      "Bash(docker compose *)", "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)",
      "Bash(git add *)", "Bash(git commit *)", "Bash(git switch *)", "Bash(git checkout -b *)",
      "Bash(git push -u origin feat/*)", "Bash(git push -u origin chore/*)", "Bash(git push -u origin adr/*)"
    ],
    "deny": [
      "Bash(git push --force*)", "Bash(git push origin main*)", "Bash(git reset --hard*)",
      "Bash(rm -rf *)", "Bash(docker system prune*)", "Read(.env)", "Read(**/.env)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "tools/hooks/fast-check.sh" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "tools/hooks/remind-checkpoint.sh" }] }
    ]
  }
}
```
`fast-check.sh` — ruff/eslint только по изменённому файлу (< 2 с). `remind-checkpoint.sh` — если есть незакоммиченные изменения старше 40 минут, печатает напоминание сделать `/checkpoint`. Деплой, платные API, публикация — не в allow-списке намеренно: на них агент обязан остановиться и спросить.

### 5.3 Протокол сессии
1. `/inspect`: прочитать `CLAUDE.md`, `BUILD_STATE.md`, `PROJECT_INDEX.md`, `git log -20`, статус нужного продукта; запустить `just test` быстрый профиль, чтобы знать стартовое состояние (не доверять BUILD_STATE на слово).
2. `/slice`: выбрать **один** срез из `BUILD_STATE.md → next action`; записать критерии приёмки в `docs/STATUS.md` до кода; реализовать; тесты пишутся вместе с кодом, не после.
3. `/verify`: статика → unit → контракт → интеграция → e2e (если Docker есть) → `just dod`. Любой шаг, который нельзя выполнить, помечается `NOT RUN: <причина>` в отчёте. Браузерная проверка через Playwright-скриншоты, если browser tool недоступен.
4. `/checkpoint` каждые 40–60 минут работы или после каждого зелёного подшага.
5. Субагент `reviewer` — перед открытием PR, на свежем контексте: читает дифф и DoD-отчёт, возвращает список замечаний; агент исправляет и перезапускает `/verify`.
6. `/handoff`: обновить `BUILD_STATE.md` (дата, ветка, commit, что готово, команды, результаты тестов с цифрами, известные баги, next action), `PROJECT_INDEX.md`, `STATUS.md`; открыть PR (`gh pr create`, тело по шаблону); выдать **NEXT SESSION PROMPT** 3–8 строк.

Сессия заканчивается только на стабильном чекпоинте: `main` или ветка запускаются `just up && just dev`, тесты среза зелёные. Если срез не доведён — откатить незавершённую часть в отдельную ветку `wip/…` и честно записать.

### 5.4 Когда агент обязан остановиться и спросить
Деньги (ключи платных API, облако), необратимые действия (удаление данных, force-push, смена истории), публикация (деплой в интернет, рассылки), продуктовые развилки, меняющие PRD (например, «нужны ли аккаунты в P31»), и любое отклонение от ADR. Всё остальное — решить, записать допущение в `STATUS.md → Assumptions`, идти дальше.

### 5.5 Параллельные сессии (после Фазы 2)
`git worktree add ../algohub-p17 -b feat/p17-mvp` → отдельная сессия Claude Code в этом каталоге. Правила: продукты CLIENT-профиля параллелятся свободно; два продукта с `api/` одновременно — только если не трогают `shared_kernel`/`services/algo-api` (иначе конфликты в composition root); изменения платформы (`packages/*`, `python/*`) — всегда отдельный PR и отдельная сессия, остальные ребейзятся после. `BUILD_STATE.md` ведётся **на продукт** (`products/<id>/docs/STATUS.md`) + корневой агрегат, чтобы параллельные сессии не перезаписывали друг друга; корневой `BUILD_STATE.md` обновляется только в сессии, которая мержит.

---

## 6. Роадмап по фазам

Оценки — в сессиях Claude Code по 2–4 часа автономной работы, не в календарных днях.

| Фаза | Содержание | Выход | Сессий |
|---|---|---|---|
| **0. Scaffold** | монорепо, `justfile`, compose (postgres), `shared_kernel` (settings, logging, errors, health, db), `@algohub/core`, `@algohub/ui` минимум (кнопка, инпут, карточка, бейдж, лейаут), `algo-api` с `/healthz`, CI `static+test`, pre-commit, `CLAUDE.md`, `.claude/*`, ADR-0001…0005, `gen-product`, `dod` (каркас) | `just setup && just up && just dev` работает; CI зелёный на пустом репо | 1–2 |
| **1. Портал** | `registry.ts` с 32 продуктами, каталог, поиск, карточки статусов, лендинг-шаблон с `notify_me`, `PROJECT_INDEX.md` генерируется, `next-intl`, security headers, axe на главной, Umami (опционально) | каталог живой, 32 честных лендинга, e2e-smoke портала | 1–2 |
| **2. P15 NoMoreDebate** | по §7 ARCHITECTURE_PLAN: алгоритмы + oracle/props, schema `p15` + миграции, API + контракт + schemathesis, UI 4 экрана, Playwright happy path, docs 10 файлов, `dod P15` зелёный | `MVP_READY` | 2–3 |
| **2.5 Шаблон** | ретроспектива: что в P15 было «ручным» → в генератор и `CLAUDE.md`; ADR-0006, 0008, 0009 | генератор создаёт ROOM-продукт с зелёным скелетом тестов | 1 |
| **3. P31 ShiftFair** | `platform.jobs` + worker (ADR-0007), OR-Tools слой образа, CP-SAT модель + объяснение невыполнимости + бенчмарки, UI таблиц/расписания/экспорта, e2e | `MVP_READY`; SOLVER-шаблон | 3–4 |
| **3.5 CLIENT-продукты** (параллельно worktree) | P07 FairSplit, P17 FairTeams; url-state codec в `@algohub/core` | 2 × `MVP_READY`; CLIENT-шаблон | 1–2 каждый |
| **4. P01 Jinal** | spike провайдеров (с остановкой на вопрос о бюджете ключей), `MapsProvider` + Demo/OSRM, кэш + Provenance, ROOM-часть на базе P15, алгоритм минимакса + oracle, UI с картой (MapLibre + OSM-тайлы) | `MVP_READY` в demo-режиме; DATA-шаблон | 3–4 + ожидание решения по API |
| **5. Деплой-готовность и решение о хостинге** | compose.prod, Caddy, бэкапы, deployment-options с ценами, ADR по хостингу и локализации данных | один продукт `LIVE` после решения | 1 + решение пользователя |
| **6. Конвейер** | по 1–2 сессии на продукт по шаблону профиля; приоритет — по `notify_me` из Umami и по Wave в каталоге | — | — |

Критерий, что архитектура «сошлась»: после Фазы 4 новый продукт любого профиля доводится до `MVP_READY` без изменений в `packages/*`, `python/shared_kernel`, CI. Если изменения нужны — это сигнал поправить платформу, а не обходить.

---

## 7. Реестр рисков процесса

| Риск | Сигнал | Действие |
|---|---|---|
| Агент тратит сессию на инфраструктуру вместо продукта | в `BUILD_STATE` третья сессия подряд без изменений в `products/` | ограничение в `CLAUDE.md`: платформенные задачи только из списка в фазе или из ретроспективы 2.5 |
| «Зелёные» отчёты без реальных прогонов | в отчёте нет команд и чисел (время, количество тестов) | шаблон отчёта в `/verify` требует вставить вывод команд; `reviewer` проверяет |
| Разрастание P15 (чат, realtime, аккаунты) | PR > 600 строк, новые таблицы вне §7 | нецели записаны в PRD; `reviewer` сверяет с PRD |
| Конфликты параллельных сессий | ребейзы с конфликтами в `services/algo-api` | правило 5.5; платформенные изменения — отдельной сессией |
| Устаревшие форматы настроек Claude Code / версии библиотек | ошибки при старте hooks, депрекейшены | в Фазе 0 агент сверяется с актуальной документацией инструментов и фиксирует версии в `docs/TOOLCHAIN.md` |
| Потеря контекста между чатами | новый чат переспрашивает базовые вещи | `/inspect` обязателен; `BUILD_STATE.md` ≤ 150 строк, остальное — в `STATUS.md` продуктов |

---

## 8. NEXT SESSION PROMPT — первая сессия (вставить в Claude Code)

```
Ты работаешь в директории будущего репозитория AlgoHub. В ней лежат только документы: CLAUDE.md, PROJECT_CATALOG.md,
MASTER_BUILD_PROMPT.md, ARCHITECTURE_PLAN.md, TESTING_STRATEGY.md, DEVOPS_AND_WORKFLOW.md. Прочитай их все полностью.

Задача этой сессии — Фаза 0 «Scaffold» из DEVOPS_AND_WORKFLOW.md §6, не дальше.

0. Подготовь среду сам. Проверь наличие и версии: git, gh, node ≥ 20, pnpm, uv, python ≥ 3.12, just, docker (compose v2),
   actionlint. Чего нет — установи (brew / npm -g / официальные install-скрипты). Docker, если отсутствует: попробуй
   `brew install --cask docker`, затем попроси меня запустить Docker Desktop один раз; если установить не удалось —
   продолжай, а все проверки, требующие Docker, помечай NOT RUN. Ничего платного не ставь. Итог запиши в docs/TOOLCHAIN.md.
   Инициализируй git (если нет), ветка main, remote origin = <URL_РЕПОЗИТОРИЯ>; убедись, что git user.name/email —
   аккаунт владельца, и что attribution агента отключён.
1. Сверься с актуальной документацией Claude Code (формат .claude/settings.json, hooks, commands, agents), pnpm/Turborepo,
   uv, Next.js 15, FastAPI — зафиксируй версии в docs/TOOLCHAIN.md.
2. Создай монорепо по ARCHITECTURE_PLAN.md §4: justfile, compose с Postgres, shared_kernel с settings/logging/errors/health/db,
   algo-api с /healthz и /readyz, @algohub/core и минимальный @algohub/ui, пустой portal-web с главной,
   pre-commit, CI (static+test), .claude/settings.json + commands + agents, ADR-0001…0005, каркас tools/gen-product и tools/dod.
3. Критерий приёмки: `just setup && just up && just dev` поднимают всё; `just test` зелёный; CI-конфиг валиден (actionlint).
4. Запусти проверки сам, исправь ошибки, пометь NOT RUN всё, что не смог выполнить, с причиной.
5. Закончи /handoff: BUILD_STATE.md, PROJECT_INDEX.md (32 строки, все NOT_STARTED), коммит в ветку chore/scaffold
   от аккаунта владельца без Co-Authored-By, push, PR через gh, и NEXT SESSION PROMPT для Фазы 1 «Портал».
Не начинай портал и продукты в этой сессии. Спрашивай только про деньги, необратимые действия и отклонения от ADR.
```
