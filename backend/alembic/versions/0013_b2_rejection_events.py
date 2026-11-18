"""반려 기록 rejection_events (T2-05 #39, data-model.md 9장, AC-F4-05·06)

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rejection_events",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("performance_id", BigID, sa.ForeignKey("performances.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("created_at", DateTime3, nullable=False),
        sa.CheckConstraint("kind IN ('AFTER_CHAT', 'NO_CHAT')", name="ck_rejection_events_kind"),
    )
    op.create_index("ix_rejection_events_user_created", "rejection_events", ["user_id", "created_at"])


def downgrade() -> None:
    # MariaDB: FK 가 쓰는 인덱스는 따로 지울 수 없어(1553) 표째 지운다
    op.drop_table("rejection_events")
