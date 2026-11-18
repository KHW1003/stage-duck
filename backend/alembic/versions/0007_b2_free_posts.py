"""커뮤니티 글 (T2-07 #100, data-model.md 9장 free_posts)

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

# 모델이 바뀌어도 이 파일 결과가 그대로이도록 모델을 import 하지 않는다
UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")


def upgrade() -> None:
    op.create_table(
        "free_posts",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("author_user_id", BigID, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("photos", sa.JSON, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("blind_reason", sa.String(500)),
        sa.Column("view_count", UInt, nullable=False, server_default="0"),
        sa.Column("comment_count", UInt, nullable=False, server_default="0"),
        sa.Column("helpful_count", UInt, nullable=False, server_default="0"),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("category IN ('FREE', 'QUESTION', 'INFO', 'NEWS')", name="ck_free_posts_category"),
        sa.CheckConstraint("status IN ('ACTIVE', 'BLINDED', 'DELETED')", name="ck_free_posts_status"),
    )
    op.create_index("ix_free_posts_status_created", "free_posts", ["status", "created_at"])
    op.create_index("ix_free_posts_category_created", "free_posts", ["category", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_free_posts_category_created", table_name="free_posts")
    op.drop_index("ix_free_posts_status_created", table_name="free_posts")
    op.drop_table("free_posts")
