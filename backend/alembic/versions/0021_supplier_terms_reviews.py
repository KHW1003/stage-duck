"""업체 거래 약관 확인 기록.

Revision ID: 0021
Revises: 0020
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "supplier_terms_reviews",
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("version", sa.String(30), primary_key=True),
        sa.Column("reviewed_at", DateTime3, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("supplier_terms_reviews")
