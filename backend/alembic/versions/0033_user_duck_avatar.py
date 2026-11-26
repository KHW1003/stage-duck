"""오리 프로필 users.duck_avatar (11/26 해원 승인). 고른 오리 "입는 것-드는 것", NULL 이면 자동 오리

Revision ID: 0033
Revises: 0032
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("duck_avatar", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "duck_avatar")
