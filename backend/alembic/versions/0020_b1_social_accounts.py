"""소셜 연결 social_accounts (T1-04 #25, FR-AUTH-05, data-model.md 2장)

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "social_accounts",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(10), nullable=False),
        sa.Column("provider_user_id", sa.String(100), nullable=False),
        sa.Column("connected_at", DateTime3, nullable=False),
        sa.CheckConstraint("provider IN ('NAVER', 'KAKAO')", name="ck_social_accounts_provider"),
        sa.UniqueConstraint("provider", "provider_user_id", name="uq_social_accounts_provider_user"),
    )


def downgrade() -> None:
    op.drop_table("social_accounts")
