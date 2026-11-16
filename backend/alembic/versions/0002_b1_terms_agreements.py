"""약관 동의 (#24, data-model.md 2장 terms_agreements)

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-16
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "terms_agreements",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("terms_type", sa.String(20), nullable=False),
        sa.Column("terms_version", sa.String(10), nullable=False),
        sa.Column("agreed", sa.Boolean, nullable=False),
        sa.Column("agreed_at", DateTime3, nullable=False),
        sa.CheckConstraint(
            "terms_type IN ('SERVICE', 'PRIVACY_REQUIRED', 'PRIVACY_OPTIONAL', 'MARKETING')",
            name="ck_terms_agreements_terms_type",
        ),
    )


def downgrade() -> None:
    op.drop_table("terms_agreements")
