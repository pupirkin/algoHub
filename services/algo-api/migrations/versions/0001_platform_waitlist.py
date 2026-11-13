"""platform.waitlist: «Сообщить, когда готово» sign-ups.

Revision ID: 0001
Revises:
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "waitlist",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), primary_key=True),
        sa.Column("product_id", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("product_id", "email", name="uq_waitlist_product_email"),
        sa.CheckConstraint("product_id ~ '^P[0-9]{2}$'", name="ck_waitlist_product_id"),
        sa.CheckConstraint("char_length(email) <= 254", name="ck_waitlist_email_length"),
        schema="platform",
        comment="Launch-notice sign-ups. Retention: 365 days or until notified (algo_api.platform.waitlist).",
    )
    op.create_index("ix_waitlist_created_at", "waitlist", ["created_at"], schema="platform")


def downgrade() -> None:
    op.drop_index("ix_waitlist_created_at", table_name="waitlist", schema="platform")
    op.drop_table("waitlist", schema="platform")
