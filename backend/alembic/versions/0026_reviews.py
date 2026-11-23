"""공연 후기·평점 reviews (specs/reviews.md, 11/20 추가)

Revision ID: 0026
Revises: 0025
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("performance_id", BigID, sa.ForeignKey("performances.id"), nullable=False),
        sa.Column("stage_id", BigID, sa.ForeignKey("stages.id"), nullable=False),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("rating", sa.SmallInteger, nullable=False),
        sa.Column("content", sa.String(500), nullable=False),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("stage_id", name="uq_reviews_stage"),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
    )
    op.create_index("ix_reviews_supplier_id", "reviews", ["supplier_id", "id"])


def downgrade() -> None:
    # 인덱스는 표와 함께 지워진다 (따로 지우면 MariaDB 가 외래키 인덱스라며 막는다)
    op.drop_table("reviews")
