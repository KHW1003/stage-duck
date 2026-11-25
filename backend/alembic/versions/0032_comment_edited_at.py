"""커뮤니티 댓글 고치기 free_comments.edited_at (11/25 해원 승인, FR-COMM-03)

Revision ID: 0032
Revises: 0031
Create Date: 2026-11-25
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import DateTime3

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("free_comments", sa.Column("edited_at", DateTime3, nullable=True))


def downgrade() -> None:
    op.drop_column("free_comments", "edited_at")
