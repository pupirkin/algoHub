# TOOLCHAIN

Зафиксировано 2026-11-12 в сессии Фазы 0 (macOS 15.7.2, arm64). Версии библиотек закреплены точно в
`package.json`/`pnpm-lock.yaml` и `pyproject.toml`/`uv.lock`; этот файл объясняет выбор и отклонения.

## 1. Инструменты среды

| Инструмент | Версия | Как установлен | Статус |
|---|---|---|---|
| git | 2.50.1 (Apple) | системный | ✅ |
| gh | 2.103.3 | бинарник из GitHub Releases → `~/.local/bin` (SHA-256 сверен) | ✅ установлен; **не авторизован** — нужен `gh auth login` владельцем |
| node | 24.22.3 LTS | tarball nodejs.org → `~/.local/opt/node24`, симлинки в `~/.local/bin` (SHA-256 сверен) | ✅ |
| pnpm | 12.18.0 | `npm i -g pnpm` | ✅ (`packageManager` в корневом `package.json`) |
| uv | 0.13.7 | официальный install-скрипт astral.sh | ✅ |
| python | 3.12.16 | `uv python install 3.12` | ✅ (`.python-version`) |
| just | 1.59.0 | `uv tool install rust-just` | ✅ |
| pre-commit | 4.7.0 | dev-зависимость в `uv.lock` (+ `uv tool` глобально) | ✅ |
| actionlint | 1.7.12 | официальный `download-actionlint.bash` | ✅ |
| shellcheck | 0.11.0 | бинарник из GitHub Releases | ✅ (actionlint проверяет `run:`-скрипты) |
| docker / compose v2 | — | **не установлен** | ❌ NOT RUN, см. §4 |
| Homebrew | — | не установлен (установка требует пароль администратора) | — |

**Отклонение:** на машине был Node 20.20.2 — он вне поддержки с апреля 2026, а Vitest 5 требует Node ≥ 22.12.
Установлен Node 24 LTS рядом; старый остался в `~/.local/opt/node20`. Откат: `ln -sf ~/.local/opt/node20/bin/{node,npm,npx} ~/.local/bin/`.
`engines.node` в репо — `>=22.12`, CI берёт версию из `.nvmrc` (24).

## 2. Сверка с актуальной документацией (2026-11-12)

| Область | Что проверено | Вывод |
|---|---|---|
| Claude Code 2.1.x (code.claude.com/docs: settings, permissions, hooks, skills, sub-agents) | `includeCoAuthoredBy` устарел с v2.0.62 → `attribution: {commit: "", pr: ""}`; правила `Bash(cmd *)`, `Read(**/.env)`; hooks `PostToolUse` с `matcher`, `Stop` без matcher, вход JSON на stdin (`tool_input.file_path`), `$CLAUDE_PROJECT_DIR`; exit 2 у PostToolUse — не блокирует, stderr уходит агенту; `.claude/commands/*.md` поддерживаются (skills предпочтительны для новых), `$ARGUMENTS`/`$0`; agents: `name`, `description`, `tools`, `model`, `permissionMode` | `.claude/settings.json` использует `attribution` вместо `includeCoAuthoredBy` (отклонение от ориентира DEVOPS §5.2, смысл тот же) |
| pnpm 12 | сборочные скрипты зависимостей запрещены по умолчанию; карантин свежих релизов | `allowBuilds: {esbuild: true}` в `pnpm-workspace.yaml`; turbo/prettier взяты на релиз старше, вместо исключений из карантина |
| Turborepo 2.11 | `turbo.json` `tasks` | задачи `build`, `typecheck`, `test`, `dev` |
| uv 0.13 | workspace, `uv_build` backend, `dependency-groups` | корень — виртуальный (`package = false`), члены — `services/*`, `python/*`, `products/*/api` |
| Next.js 15 (ADR) | последняя 15.x — 15.5.29 (16.x существует, не берём: стек зафиксирован ADR) | App Router, `transpilePackages`, `output: "standalone"`; webpack не маппит `./x.js`→`.ts`, поэтому внутренние пакеты используют импорты без расширений (`moduleResolution: Bundler`) |
| FastAPI 0.162 / Starlette 1.10 | TestClient Starlette требует `httpx2` (httpx устарел для него) | dev-зависимость `httpx2` |
| ESLint | ESLint 10 вышел, но `eslint-plugin-jsx-a11y` 6.10.2 поддерживает только ≤ 9 | ESLint 9.39.5 (pnpm помечает его deprecated) — обновить, когда jsx-a11y поддержит 10 |
| TypeScript | 7.0 (нативный компилятор) вышел; `typescript-eslint` поддерживает `<6.1` | TypeScript 5.9.3 |
| eslint-plugin-boundaries 7 | правило `boundaries/dependencies` с `policies`, опция `mode` устарела | конфиг в корневом `eslint.config.js` |

## 3. Ключевые версии библиотек

TS: next 15.5.29 · react 19.3.1 · typescript 5.9.3 · turbo 2.11.10 · tailwindcss 4.3.5 · vitest 5.1.0 · vite 8.3.8 ·
fast-check 4.10.2 · @testing-library/react 16.3.3 · axe-core 4.14.0 · eslint 9.39.5 · typescript-eslint 8.72.2 ·
eslint-plugin-boundaries 7.4.2 · eslint-plugin-jsx-a11y 6.10.2 · prettier 3.9.10 · tsx 4.23.15.

Python 3.12: fastapi 0.162.5 · starlette 1.10.0 · uvicorn 0.54.0 · pydantic 2.14.3 · pydantic-settings 2.16.2 ·
sqlalchemy 2.1.8 · psycopg 3.3.8 · structlog 26.1.0 · pytest 9.2.0 · hypothesis 6.170.15 · ruff 0.17.4 ·
mypy 2.4.1 · import-linter 2.16 · httpx2 2.16.0.

GitHub Actions: checkout@v7 · setup-node@v7 · pnpm/action-setup@v6 · astral-sh/setup-uv@v10.3.3 (pinned by SHA: the action has no moving major tag) · extractions/setup-just@v4.
Hooks: pre-commit-hooks v6.0.0 · gitleaks v8.30.1.

Отложено до фазы, где появляется потребность: alembic (первая миграция P15), playwright/@axe-core/playwright (e2e портала, Фаза 1),
next-intl (Фаза 1), openapi-typescript + `@algohub/api-client` (первый продуктовый API, P15), schemathesis, slowapi, OR-Tools (P31), knip.

## 4. Docker — NOT RUN

Docker Desktop не установлен, Homebrew тоже; владелец решил продолжать без Docker. Поэтому в этой сессии **не выполнялись**:
`just up`, `just down`, `just test-int` (интеграционные тесты с реальным Postgres), `just migrate` против БД, `/readyz` в статусе `ready`.
Рецепты печатают `NOT RUN: docker is not installed` и выходят с кодом 1. В CI интеграционные тесты идут против сервиса `postgres:16-alpine`.

Чтобы включить: установить Docker Desktop (или OrbStack), запустить один раз, затем `just up && just test-int`.
