"""SQLAlchemy Core tables of schema ``p15``: mirror of migration 0001.

The integration test compares columns, keys and constraints with the migrated database.

Every foreign key stays inside the schema (ADR-0005). Deleting a room cascades to everything it owns.
"""

from __future__ import annotations

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    MetaData,
    PrimaryKeyConstraint,
    SmallInteger,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from algohub_p15 import SCHEMA

metadata = MetaData(schema=SCHEMA)

rooms = Table(
    "rooms",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("question", Text, nullable=False),
    Column("method", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("deadline_at", DateTime(timezone=True), nullable=True),
    Column("organizer_token_hash", Text, nullable=False),
    Column("max_participants", Integer, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("closed_at", DateTime(timezone=True), nullable=True),
    Column("delete_after", DateTime(timezone=True), nullable=False),
    CheckConstraint("status IN ('open', 'closed')", name="ck_rooms_status"),
    CheckConstraint(
        "method IN ('condorcet_borda', 'borda', 'irv', 'minimax_regret')", name="ck_rooms_method"
    ),
    CheckConstraint("char_length(question) BETWEEN 1 AND 200", name="ck_rooms_question_length"),
    CheckConstraint("max_participants BETWEEN 2 AND 50", name="ck_rooms_max_participants"),
    CheckConstraint("organizer_token_hash ~ '^[0-9a-f]{64}$'", name="ck_rooms_token_hash"),
    CheckConstraint("(status = 'closed') = (closed_at IS NOT NULL)", name="ck_rooms_closed_at"),
    Index("ix_rooms_delete_after", "delete_after"),
)

options = Table(
    "options",
    metadata,
    Column("room_id", Uuid, ForeignKey("p15.rooms.id", ondelete="CASCADE"), nullable=False),
    Column("position", SmallInteger, nullable=False),
    Column("label", Text, nullable=False),
    PrimaryKeyConstraint("room_id", "position", name="pk_options"),
    CheckConstraint("position BETWEEN 0 AND 9", name="ck_options_position"),
    CheckConstraint("char_length(label) BETWEEN 1 AND 80", name="ck_options_label_length"),
)

participants = Table(
    "participants",
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("room_id", Uuid, ForeignKey("p15.rooms.id", ondelete="CASCADE"), nullable=False),
    Column("display_name", Text, nullable=False),
    Column("name_key", Text, nullable=False),
    Column("token_hash", Text, nullable=False),
    Column("joined_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("room_id", "name_key", name="uq_participants_room_name"),
    UniqueConstraint("token_hash", name="uq_participants_token_hash"),
    UniqueConstraint("id", "room_id", name="uq_participants_id_room"),  # target of the ballots composite FK
    CheckConstraint("char_length(display_name) BETWEEN 1 AND 40", name="ck_participants_name_length"),
    CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="ck_participants_token_hash"),
    Index("ix_participants_room_id", "room_id"),
)

ballots = Table(
    "ballots",
    metadata,
    Column("participant_id", Uuid, primary_key=True),
    Column("room_id", Uuid, ForeignKey("p15.rooms.id", ondelete="CASCADE"), nullable=False),
    Column("ranking", ARRAY(SmallInteger), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    # A ballot always belongs to its participant's room (not only by service code).
    ForeignKeyConstraint(
        ["participant_id", "room_id"],
        ["p15.participants.id", "p15.participants.room_id"],
        ondelete="CASCADE",
        name="fk_ballots_participant_room",
    ),
    CheckConstraint("cardinality(ranking) BETWEEN 1 AND 10", name="ck_ballots_ranking_length"),
    Index("ix_ballots_room_id", "room_id"),
)

results = Table(
    "results",
    metadata,
    Column("room_id", Uuid, ForeignKey("p15.rooms.id", ondelete="CASCADE"), primary_key=True),
    Column("computed_at", DateTime(timezone=True), nullable=False),
    Column("method", Text, nullable=False),
    Column("outcome", Text, nullable=False),
    Column("chosen_position", SmallInteger, nullable=True),
    Column("payload", JSONB, nullable=False),
    CheckConstraint("outcome IN ('winner', 'tie', 'no_ballots')", name="ck_results_outcome"),
)
