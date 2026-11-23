"""견적 내역 확인 카드 confirm_requests (T3-03 #43, data-model.md 6장, AC-F3-09~14)

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "confirm_requests",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("room_id", BigID, sa.ForeignKey("chat_rooms.id"), nullable=False),
        sa.Column("quote_version_id", BigID, sa.ForeignKey("quote_versions.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("expires_at", DateTime3, nullable=False),
        sa.Column("viewed_at", DateTime3, nullable=True),
        sa.Column("decided_at", DateTime3, nullable=True),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('PENDING', 'CONFIRMED', 'RENEGOTIATE', 'EXPIRED', 'INVALIDATED')", name="ck_confirm_requests_status"
        ),
    )
    op.create_index("ix_confirm_requests_room_status", "confirm_requests", ["room_id", "status"])


def downgrade() -> None:
    # 인덱스는 표와 함께 지워진다. 따로 먼저 지우면 MariaDB 가 외래키가 쓰는 인덱스라며 막는다 (1553)
    op.drop_table("confirm_requests")
