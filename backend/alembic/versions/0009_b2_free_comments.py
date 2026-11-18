"""커뮤니티 댓글·도움 돼요·저장 (T2-08 #101, data-model.md 9장 free_comments·free_helpfuls·free_bookmarks)

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

# 모델이 바뀌어도 이 파일 결과가 그대로이도록 모델을 import 하지 않는다
UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")


def upgrade() -> None:
    op.create_table(
        "free_comments",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("post_id", BigID, sa.ForeignKey("free_posts.id"), nullable=False),
        sa.Column("parent_id", BigID, sa.ForeignKey("free_comments.id")),
        sa.Column("author_user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("blind_reason", sa.String(500)),
        sa.Column("helpful_count", UInt, nullable=False, server_default="0"),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('ACTIVE', 'BLINDED', 'DELETED')", name="ck_free_comments_status"),
    )
    op.create_index("ix_free_comments_post_created", "free_comments", ["post_id", "created_at"])
    op.create_table(
        "free_helpfuls",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", BigID, nullable=False),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("target_type IN ('POST', 'COMMENT')", name="ck_free_helpfuls_target_type"),
        sa.UniqueConstraint("user_id", "target_type", "target_id", name="uq_free_helpfuls_user_target"),
    )
    op.create_table(
        "free_bookmarks",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("post_id", BigID, sa.ForeignKey("free_posts.id"), nullable=False),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "post_id", name="uq_free_bookmarks_user_post"),
    )


def downgrade() -> None:
    op.drop_table("free_bookmarks")
    op.drop_table("free_helpfuls")
    op.drop_index("ix_free_comments_post_created", table_name="free_comments")
    op.drop_table("free_comments")
