"""업체 찾기 소개 글 pr_posts (#30, data-model.md 9장, FR-BOARD-01~03)

active_guard: 활성·가린 글이면 1, 아니면 NULL + UNIQUE(supplier_id, category, active_guard) → 부문당 1개 (AC-F4-02·10).

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

NOW = sa.text("CURRENT_TIMESTAMP")
ACTIVE_GUARD_EXPR = "CASE WHEN status IN ('ACTIVE', 'BLINDED') THEN 1 ELSE NULL END"


def upgrade() -> None:
    op.create_table(
        "pr_posts",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("photos", sa.JSON, nullable=False),
        sa.Column("sido", sa.String(20), nullable=False),
        sa.Column("price_range", sa.String(50)),
        sa.Column("status", sa.String(10), nullable=False, server_default="ACTIVE"),
        sa.Column("blind_reason", sa.String(500)),
        sa.Column("bumped_at", DateTime3, nullable=False),
        sa.Column("active_guard", sa.SmallInteger, sa.Computed(ACTIVE_GUARD_EXPR, persisted=True)),
        sa.Column("created_at", DateTime3, nullable=False, server_default=NOW),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=NOW),
        sa.CheckConstraint("category IN ('VENUE', 'EQUIPMENT', 'ENGINEER')", name="ck_pr_posts_category"),
        sa.CheckConstraint("status IN ('ACTIVE', 'HIDDEN', 'BLINDED', 'DELETED')", name="ck_pr_posts_status"),
        sa.UniqueConstraint("supplier_id", "category", "active_guard", name="uq_pr_posts_active_guard"),
    )
    op.create_index("ix_pr_posts_status_bumped_at", "pr_posts", ["status", "bumped_at"])
    op.create_index("ix_pr_posts_category_bumped_at", "pr_posts", ["category", "bumped_at"])


def downgrade() -> None:
    op.drop_index("ix_pr_posts_category_bumped_at", table_name="pr_posts")
    op.drop_index("ix_pr_posts_status_bumped_at", table_name="pr_posts")
    op.drop_table("pr_posts")
