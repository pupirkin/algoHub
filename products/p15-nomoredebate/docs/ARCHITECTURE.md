# P15 NoMoreDebate — архитектура

Профиль: ROOM (ARCHITECTURE_PLAN §3, §7). Алгоритм — один язык (Python), расчёт авторитетный на сервере.

## Компоненты
| Слой | Где | Что |
|---|---|---|
| Алгоритмы | `python/algorithms/src/algorithms/social_choice/` | `pairwise_wins`, `condorcet_winner`, `borda_points_x2`, `irv`, `regrets`, `tiebreak_order`, `decide`, `explain` — чистые функции, stdlib |
| API | `products/p15-nomoredebate/api` (`algohub_p15`) | `schemas` (контракт), `service` (authz, дедлайны), `store` (порт + Postgres), `memory_store` (тесты/preview), `router` (`/api/v1/p15`), `retention` |
| Composition root | `services/algo-api/src/algo_api/products.py` | `p15_mount()` подключает роутер и `SqlRoomStore` |
| Контракт | `services/algo-api/openapi.json` → `packages/api-client` | генерируемые типы для UI |
| UI | `products/p15-nomoredebate/web` (`@algohub/p15`) | 4 экрана, загружается порталом через `registry.load()` |

## Алгоритм
Бюллетень — кортеж индексов вариантов, от лучшего к худшему; невыставленные делят последнее место.
- Дуэли: `wins[a][b]` = число бюллетеней, где a строго выше b.
- Кондорсе: побеждает все дуэли строго.
- Борда (удвоенные целые баллы): место i из m → `2(m-1-i)`; каждый невыставленный → `m-1-k`
  (среднее оставшихся мест). Эквивалентно сумме дуэлей с ничьей = ½.
- IRV: считаем первые места среди оставшихся; > 50 % неисчерпанных бюллетеней — победа; если у всех поровну —
  ничья; иначе выбывает вариант с минимумом (при равенстве — последний в порядке жребия).
- Minimax regret: сожаление голосующего о варианте = сколько вариантов он поставил выше; минимизируем
  (максимум, сумма).
- Ничья: в результате все равные варианты + `tiebreak_pick` — первый из них в порядке
  `sha256(f"{room_id}:{i}")`. Порядок не зависит от бюллетеней, поэтому им нельзя манипулировать голосованием.
- Результат сохраняется (JSONB) в момент закрытия: изменения алгоритма не переписывают прошлые решения.

Тесты: oracle (полный перебор 3 вариантов × до 3 голосующих = 816 профилей на метод + случайные до 6×8),
property (монотонность, нейтральность, анонимность, детерминизм, IRV-большинство, Кондорсе, Парето, проигравший
по Кондорсе не побеждает по Борда), golden (`scenarios/*.json`, через алгоритм и через HTTP), budget
(50 бюллетеней × 10 вариантов: p95 < 25 мс).

## Данные (schema `p15`)
```
rooms(id uuid pk, question, method, status open|closed, deadline_at?, organizer_token_hash, max_participants,
      created_at, closed_at?, delete_after)                       -- CHECK'и на всё перечисленное
options(room_id fk, position 0..9, label)                          -- pk(room_id, position); id варианта = position
participants(id uuid pk, room_id fk, display_name, name_key, token_hash unique, joined_at)
                                                                   -- unique(room_id, name_key)
ballots(participant_id pk fk, room_id fk, ranking smallint[], updated_at)
results(room_id pk fk, computed_at, method, outcome, chosen_position?, payload jsonb)
```
Все FK внутри схемы, `ON DELETE CASCADE` от комнаты. Миграции: `api/migrations` (version table
`p15.alembic_version`), `just migrate`.

Конкурентность: вступление — `FOR UPDATE` на комнате (лимит участников и проверка «открыта»); бюллетень —
`FOR SHARE` + upsert (последняя запись побеждает); закрытие — `FOR UPDATE`, результат считается ровно один раз.

## API `/api/v1/p15`
| Метод | Путь | Доступ | Ответ |
|---|---|---|---|
| POST | `/rooms` | все (лимит 20/ч на IP) | 201 `{room, organizer_token, share_path, organizer_path}` |
| GET | `/rooms/{id}` | все | публичное состояние (без токенов, имён, бюллетеней) |
| POST | `/rooms/{id}/participants` | все (30/мин) | 201 `{participant_id, participant_token, display_name}`; 409 `name_taken`/`room_full`/`room_closed` |
| GET | `/rooms/{id}/participants` | организатор | имена + `has_voted` |
| GET | `/rooms/{id}/ballot` | участник | свой бюллетень |
| PUT | `/rooms/{id}/ballot` | участник (60/мин) | идемпотентно, перезапись; 422 `invalid_ballot`; 409 `room_closed` |
| POST | `/rooms/{id}/close` | организатор (20/мин) | результат; идемпотентно |
| GET | `/rooms/{id}/result` | все | результат; 404 `result_not_ready` пока открыта |
| DELETE | `/rooms/{id}` | организатор (20/мин) | 204 |

Токены: 128 бит (`secrets.token_urlsafe(16)`), в БД — sha256. Нет токена → 401 (проверяется первым),
чужой → 403, неизвестная комната → 404. Дедлайн закрывает комнату лениво — первым запросом после него.
Результат несёт `provenance: {source: "user", fetched_at}`.

## Retention
30 дней после закрытия, либо 30 дней после создания, если комнату не закрыли. `just purge P15` (до
появления worker в P31 — вручную/cron; расписание — требование перед деплоем).
