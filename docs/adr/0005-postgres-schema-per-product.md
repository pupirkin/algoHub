# ADR-0005: Postgres schema per product, Alembic per product, no cross-schema FKs

- Status: Accepted
- Date: 2026-11-12

## Контекст
Продуктам ROOM/SOLVER/DATA нужна персистентность. Общие таблицы между продуктами создают скрытую связность и
мешают выделению сервиса (ADR-0003).

## Варианты
1. **Один инстанс Postgres 16, schema на продукт** (`p15`, `p31`, …) + `platform` для общих механизмов
   (jobs, waitlist, heartbeat). Alembic на продукт с `version_table_schema=<pid>`.
2. База на продукт — больше инфраструктуры локально и в CI без выгоды на текущем масштабе.
3. Общая schema с префиксами таблиц — легко нарушить изоляцию, нет независимых миграций.
4. Redis/другие хранилища — не нужны (ADR о Redis — только по измеренной необходимости).

## Решение
Вариант 1. Запрещены cross-schema foreign keys и общие таблицы между продуктами. Связи между продуктами —
только через API. Миграции — отдельный шаг (`just migrate`), не при старте процесса.

## Последствия
- Разнос продуктов по инстансам — изменение конфигурации (`DATABASE_URL` продукта), а не схемы данных.
- Тест каждого продукта: `upgrade head → downgrade base → upgrade head`; тест по `information_schema`
  на отсутствие cross-schema FK (TESTING_STRATEGY §4).
- Phase 0: compose создаёт только schema `platform`; product-schemas создают их собственные миграции.

## Как откатить
`pg_dump --schema=<pid>` и восстановление в отдельный инстанс; код продукта не меняется.
