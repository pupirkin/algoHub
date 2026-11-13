"""p15: rooms, options, participants, ballots, results.

Revision ID: 0001
Revises:
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

S = "p15"


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("method", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("organizer_token_hash", sa.Text, nullable=False),
        sa.Column("max_participants", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delete_after", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('open', 'closed')", name="ck_rooms_status"),
        sa.CheckConstraint(
            "method IN ('condorcet_borda', 'borda', 'irv', 'minimax_regret')", name="ck_rooms_method"
        ),
        sa.CheckConstraint("char_length(question) BETWEEN 1 AND 200", name="ck_rooms_question_length"),
        sa.CheckConstraint("max_participants BETWEEN 2 AND 50", name="ck_rooms_max_participants"),
        sa.CheckConstraint("organizer_token_hash ~ '^[0-9a-f]{64}$'", name="ck_rooms_token_hash"),
        sa.CheckConstraint("(status = 'closed') = (closed_at IS NOT NULL)", name="ck_rooms_closed_at"),
        schema=S,
        comment="Voting rooms. Retention: 30 days after closing (or creation if never closed).",
    )
    op.create_index("ix_rooms_delete_after", "rooms", ["delete_after"], schema=S)
    op.create_table(
        "options",
        sa.Column("room_id", sa.Uuid, sa.ForeignKey(f"{S}.rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.SmallInteger, nullable=False),
        sa.Column("label", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("room_id", "position", name="pk_options"),
        sa.CheckConstraint("position BETWEEN 0 AND 9", name="ck_options_position"),
        sa.CheckConstraint("char_length(label) BETWEEN 1 AND 80", name="ck_options_label_length"),
        schema=S,
    )
    op.create_table(
        "participants",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("room_id", sa.Uuid, sa.ForeignKey(f"{S}.rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("name_key", sa.Text, nullable=False),
        sa.Column("token_hash", sa.Text, nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("room_id", "name_key", name="uq_participants_room_name"),
        sa.UniqueConstraint("token_hash", name="uq_participants_token_hash"),
        sa.CheckConstraint("char_length(display_name) BETWEEN 1 AND 40", name="ck_participants_name_length"),
        sa.CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name="ck_participants_token_hash"),
        schema=S,
    )
    op.create_index("ix_participants_room_id", "participants", ["room_id"], schema=S)
    op.create_table(
        "ballots",
        sa.Column(
            "participant_id",
            sa.Uuid,
            sa.ForeignKey(f"{S}.participants.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("room_id", sa.Uuid, sa.ForeignKey(f"{S}.rooms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ranking", postgresql.ARRAY(sa.SmallInteger), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("cardinality(ranking) BETWEEN 1 AND 10", name="ck_ballots_ranking_length"),
        schema=S,
    )
    op.create_index("ix_ballots_room_id", "ballots", ["room_id"], schema=S)
    op.create_table(
        "results",
        sa.Column("room_id", sa.Uuid, sa.ForeignKey(f"{S}.rooms.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("method", sa.Text, nullable=False),
        sa.Column("outcome", sa.Text, nullable=False),
        sa.Column("chosen_position", sa.SmallInteger, nullable=True),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.CheckConstraint("outcome IN ('winner', 'tie', 'no_ballots')", name="ck_results_outcome"),
        schema=S,
    )


def downgrade() -> None:
    op.drop_table("results", schema=S)
    op.drop_index("ix_ballots_room_id", table_name="ballots", schema=S)
    op.drop_table("ballots", schema=S)
    op.drop_index("ix_participants_room_id", table_name="participants", schema=S)
    op.drop_table("participants", schema=S)
    op.drop_table("options", schema=S)
    op.drop_index("ix_rooms_delete_after", table_name="rooms", schema=S)
    op.drop_table("rooms", schema=S)
