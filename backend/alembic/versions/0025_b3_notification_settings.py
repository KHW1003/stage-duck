"""알림 받는 방법 notification_settings — 중요 알림을 메일로도 (specs/notifications.md 10장)

줄이 없으면 메일 알림 켬. 사용자가 [알림] 화면에서 끄면 줄이 생긴다.

Revision ID: 0025
Revises: 0024
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_settings",
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("email_enabled", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("notification_settings")
