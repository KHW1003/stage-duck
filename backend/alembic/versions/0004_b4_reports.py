"""신고 (T4-09 #54, data-model.md 9장 reports)

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-17
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("reporter_user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", BigID, nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN"),
        sa.Column("handled_by", BigID, sa.ForeignKey("users.id")),
        sa.Column("handled_at", DateTime3),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "target_type IN ('CHAT_ROOM', 'PR_POST', 'FREE_POST', 'FREE_COMMENT', 'USER')",
            name="ck_reports_target_type",
        ),
        sa.CheckConstraint("status IN ('OPEN', 'WARNED', 'DISMISSED')", name="ck_reports_status"),
        sa.UniqueConstraint("reporter_user_id", "target_type", "target_id", name="uq_reports_reporter_target"),
    )


def downgrade() -> None:
    op.drop_table("reports")
