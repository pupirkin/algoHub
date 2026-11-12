# ADR-0001: Monorepo with pnpm + Turborepo and uv workspaces

- Status: Accepted
- Date: 2026-11-12

## Контекст
32 продукта с общим порталом, общим API и общими библиотеками в двух языках (TypeScript и Python 3.12).
Агенту нужен один репозиторий, одна команда на действие и воспроизводимые lockfile'ы.

## Варианты
1. **pnpm workspaces + Turborepo (TS) и uv workspace (Python), `just` как фасад.**
2. Nx для обоих языков — тяжелее для смешанного стека, Python-плагины вторичны, много собственной конфигурации.
3. Poetry вместо uv — медленнее, нет workspaces уровня uv, нет управления версиями Python.
4. Полирепо — дублирование CI/конфигов, межпакетные изменения через публикацию.

## Решение
Вариант 1. `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `products/*/web`, `tools/*`. Корневой `pyproject.toml`
(uv workspace): `services/*`, `python/*`, `products/*/api`. Внутренние TS-пакеты потребляются как исходники
(без отдельной сборки), Next.js транспилирует их через `transpilePackages`. Все команды — через `justfile`.

## Последствия
- Один `pnpm-lock.yaml` и один `uv.lock`; одна виртуалка `.venv` на репо.
- Turborepo кэширует `typecheck/test/build` по хешам; remote cache не нужен (GitHub cache по lockfile).
- Агент не держит в голове два тулчейна: `just setup|up|dev|test|lint|typecheck|dod|gen|index|checkpoint`.

## Как откатить
Turborepo можно убрать без изменения кода (заменить на `pnpm -r run`). Замена uv на другой менеджер затрагивает
только `pyproject.toml`-файлы и `justfile`.
