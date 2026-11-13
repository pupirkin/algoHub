"""Schema p15 against a real Postgres (TESTING_STRATEGY §4, §9 ROOM). Run: `just up && just test-int`.

The HTTP suites (test_api.py, test_scenarios_golden.py) also run on SqlRoomStore via the `sql` store param.
"""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta

import pytest
from alembic import command
from p15_testkit import alembic_config, db_url
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from algohub_p15 import tables
from algohub_p15.domain import delete_after_open, token_hash
from algohub_p15.errors import RoomClosedError
from algohub_p15.store import NewParticipant, NewRoom, RoomStore, SqlRoomStore
from shared_kernel.db import create_session_factory

T0 = datetime(2026, 11, 13, 12, 0, tzinfo=UTC)


def _room(**kw: object) -> NewRoom:
    base: dict[str, object] = {
        "id": uuid.uuid4(),
        "question": "Q?",
        "method": "borda",
        "deadline_at": None,
        "organizer_token_hash": token_hash("organizer"),
        "max_participants": 30,
        "created_at": T0,
        "delete_after": delete_after_open(T0),
        "options": ("A", "B", "C"),
    }
    base.update(kw)
    return NewRoom(**base)  # type: ignore[arg-type]


def _participant(name: str) -> NewParticipant:
    return NewParticipant(uuid.uuid4(), name, name.casefold(), token_hash(f"tok-{name}-{uuid.uuid4()}"), T0)


@pytest.mark.integration
def test_migrations_roundtrip_upgrade_downgrade_upgrade() -> None:
    cfg = alembic_config(db_url())
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    eng = create_engine(db_url())
    assert not inspect(eng).has_table("rooms", schema="p15")
    command.upgrade(cfg, "head")
    assert set(inspect(eng).get_table_names(schema="p15")) >= {t.name for t in tables.metadata.sorted_tables}
    eng.dispose()


@pytest.mark.integration
def test_tables_match_sqlalchemy_definitions(migrated_engine: Engine) -> None:
    insp = inspect(migrated_engine)
    for table in tables.metadata.sorted_tables:
        db_cols = {c["name"]: c for c in insp.get_columns(table.name, schema="p15")}
        assert set(db_cols) == {c.name for c in table.columns}, table.name
        for col in table.columns:
            assert db_cols[col.name]["nullable"] == col.nullable, f"{table.name}.{col.name}"
            db_type = str(db_cols[col.name]["type"].compile(dialect=migrated_engine.dialect))
            model_type = str(col.type.compile(dialect=migrated_engine.dialect))
            assert db_type == model_type, f"{table.name}.{col.name}"
        checks = {c["name"] for c in insp.get_check_constraints(table.name, schema="p15")}
        assert checks == {c.name for c in table.constraints if c.__class__.__name__ == "CheckConstraint"}
        uniques = {u["name"] for u in insp.get_unique_constraints(table.name, schema="p15")}
        assert uniques == {c.name for c in table.constraints if c.__class__.__name__ == "UniqueConstraint"}
        pk = insp.get_pk_constraint(table.name, schema="p15")
        assert sorted(pk["constrained_columns"]) == sorted(c.name for c in table.primary_key.columns), (
            table.name
        )
        db_fks = {
            (
                tuple(fk["constrained_columns"]),
                fk["referred_table"],
                tuple(fk["referred_columns"]),
                (fk.get("options") or {}).get("ondelete"),
            )
            for fk in insp.get_foreign_keys(table.name, schema="p15")
        }
        model_fks = {
            (
                tuple(fk.column_keys),
                next(iter(fk.elements)).column.table.name,
                tuple(e.column.name for e in fk.elements),
                fk.ondelete,
            )
            for fk in table.foreign_key_constraints
        }
        assert db_fks == model_fks, table.name
        db_indexes = insp.get_indexes(table.name, schema="p15")
        indexes = {i["name"] for i in db_indexes if not i.get("duplicates_constraint")}
        assert indexes == {i.name for i in table.indexes}, table.name


@pytest.mark.integration
def test_no_foreign_key_leaves_schema_p15(migrated_engine: Engine) -> None:
    with migrated_engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT tc.table_schema, ccu.table_schema AS ref_schema
                FROM information_schema.table_constraints tc
                JOIN information_schema.constraint_column_usage ccu
                  ON tc.constraint_name = ccu.constraint_name AND tc.constraint_schema = ccu.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND (tc.table_schema = 'p15' OR ccu.table_schema = 'p15')
                """
            )
        ).all()
    assert rows, "expected intra-schema foreign keys"
    assert {(r.table_schema, r.ref_schema) for r in rows} == {("p15", "p15")}


@pytest.fixture
def sql_store(migrated_engine: Engine) -> SqlRoomStore:
    with migrated_engine.begin() as conn:
        conn.execute(text("TRUNCATE p15.rooms CASCADE"))
    return SqlRoomStore(create_session_factory(migrated_engine))


def _race(n: int, fn: Callable[[int], object]) -> list[object]:
    barrier = threading.Barrier(n)
    out: list[object] = [None] * n

    def run(i: int) -> None:
        barrier.wait()
        try:
            out[i] = fn(i)
        except Exception as exc:  # collected and asserted below
            out[i] = exc

    threads = [threading.Thread(target=run, args=(i,)) for i in range(n)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    return out


@pytest.mark.integration
def test_concurrent_ballots_last_write_wins_without_errors(sql_store: SqlRoomStore) -> None:
    room = _room()
    sql_store.create_room(room)
    p = _participant("Ann")
    sql_store.add_participant(room.id, p, T0)
    rankings = [(0, 1, 2), (2, 1, 0), (1,), (2, 0)] * 3
    results = _race(len(rankings), lambda i: sql_store.put_ballot(room.id, p.id, rankings[i], T0))
    assert not [r for r in results if isinstance(r, Exception)]
    stored = sql_store.find_participant(room.id, p.token_hash)
    assert stored is not None
    assert stored.ranking in rankings
    record = sql_store.get_room(room.id)
    assert record is not None
    assert record.ballot_count == 1


@pytest.mark.integration
def test_concurrent_joins_never_exceed_the_cap(sql_store: SqlRoomStore) -> None:
    room = _room(max_participants=5)
    sql_store.create_room(room)
    results = _race(12, lambda i: sql_store.add_participant(room.id, _participant(f"P{i}"), T0))
    assert sum(r is None for r in results) == 5
    record = sql_store.get_room(room.id)
    assert record is not None
    assert record.participant_count == 5


@pytest.mark.integration
def test_concurrent_close_computes_once(sql_store: SqlRoomStore) -> None:
    room = _room()
    sql_store.create_room(room)
    calls: list[int] = []

    def compute(_room: object, ballots: object) -> tuple[str, int | None, dict[str, object]]:
        calls.append(1)
        return "no_ballots", None, {"outcome": "no_ballots"}

    results = _race(6, lambda _i: sql_store.close_room(room.id, T0, compute))
    assert not [r for r in results if isinstance(r, Exception)]
    assert len(calls) == 1


def test_retention_purges_expired_rooms_only(store: RoomStore) -> None:
    # `store` (conftest): in-memory always, Postgres under `just test-int`.
    old, fresh = _room(created_at=T0 - timedelta(days=40), delete_after=T0 - timedelta(days=10)), _room()
    for r in (old, fresh):
        store.create_room(r)
    store.add_participant(old.id, _participant("Ann"), T0 - timedelta(days=40))
    assert store.purge_expired(T0) == 1
    assert store.get_room(old.id) is None
    assert store.get_room(fresh.id) is not None
    assert store.purge_expired(T0) == 0


@pytest.mark.integration
def test_ballots_racing_a_close_are_either_counted_or_rejected(sql_store: SqlRoomStore) -> None:
    room = _room()
    sql_store.create_room(room)
    voters = [_participant(f"V{i}") for i in range(8)]
    for v in voters:
        sql_store.add_participant(room.id, v, T0)
    seen: list[int] = []

    def compute(
        _room: object, ballots: Sequence[tuple[int, ...]]
    ) -> tuple[str, int | None, dict[str, object]]:
        seen.append(len(ballots))
        return ("winner" if ballots else "no_ballots"), None, {"n": len(ballots)}

    def act(i: int) -> object:
        if i == len(voters):
            return sql_store.close_room(room.id, T0, compute)
        return sql_store.put_ballot(room.id, voters[i].id, (0, 1), T0)

    results = _race(len(voters) + 1, act)
    unexpected = [r for r in results if isinstance(r, Exception) and not isinstance(r, RoomClosedError)]
    assert unexpected == []
    accepted = sum(1 for r in results[:-1] if not isinstance(r, Exception))
    assert seen == [accepted]  # computed once, over exactly the ballots committed before the close
    record = sql_store.get_room(room.id)
    assert record is not None
    assert record.ballot_count == accepted


@pytest.mark.integration
def test_a_ballot_cannot_point_at_another_room(sql_store: SqlRoomStore, migrated_engine: Engine) -> None:
    a, b = _room(), _room()
    for r in (a, b):
        sql_store.create_room(r)
    ann = _participant("Ann")
    sql_store.add_participant(a.id, ann, T0)
    with pytest.raises(IntegrityError), migrated_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO p15.ballots VALUES (:p, :r, ARRAY[0]::smallint[], now())"),
            {"p": ann.id, "r": b.id},
        )
