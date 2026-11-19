"""사이트 안 알림 notifications (T3-05 #45, specs/notifications.md 4장, D-52)

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("body", sa.String(200), nullable=True),
        sa.Column("link", sa.String(255), nullable=False),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("read_at", DateTime3, nullable=True),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id", "id"])
    op.create_index("ix_notifications_user_read", "notifications", ["user_id", "read_at"])


def downgrade() -> None:
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
