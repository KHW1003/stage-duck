"""비밀번호 찾기 password_reset_tokens · password_reset_requests (T1-14 #122, D-55, AC-F1-21~23)

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.CHAR(64), nullable=False, unique=True),
        sa.Column("expires_at", DateTime3, nullable=False),
        sa.Column("used_at", DateTime3, nullable=True),
        sa.Column("created_at", DateTime3, nullable=False),
    )
    op.create_index("ix_password_reset_tokens_user_used", "password_reset_tokens", ["user_id", "used_at"])
    op.create_table(
        "password_reset_requests",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("email_hash", sa.CHAR(64), nullable=False),
        sa.Column("requested_at", DateTime3, nullable=False),
    )
    op.create_index("ix_password_reset_requests_email_at", "password_reset_requests", ["email_hash", "requested_at"])


def downgrade() -> None:
    # MariaDB: FK 가 쓰는 인덱스는 따로 지울 수 없어(1553) 표째 지운다
    op.drop_table("password_reset_requests")
    op.drop_table("password_reset_tokens")
