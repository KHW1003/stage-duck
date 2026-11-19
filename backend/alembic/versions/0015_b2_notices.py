"""공지사항 notices (T2-10 #103, FR-CS-02, AC-F5-21)

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notices",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_pinned", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("published_at", DateTime3, nullable=False),
        sa.Column("created_by", BigID, sa.ForeignKey("users.id"), nullable=True),
        sa.CheckConstraint("category IN ('GUIDE', 'MAINTENANCE', 'POLICY')", name="ck_notices_category"),
    )
    op.create_index("ix_notices_pinned_published", "notices", ["is_pinned", "published_at"])


def downgrade() -> None:
    # MariaDB: FK 가 쓰는 인덱스는 따로 지울 수 없어(1553) 표째 지운다
    op.drop_table("notices")
