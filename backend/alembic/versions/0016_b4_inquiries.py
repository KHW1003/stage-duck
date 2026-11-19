"""1:1 문의 inquiries (T2-09 #102, FR-CS-01, AC-F5-18~20, D-48)

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inquiries",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("performance_id", BigID, sa.ForeignKey("performances.id"), nullable=True),
        sa.Column("title", sa.String(50), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="WAITING"),
        sa.Column("answer", sa.Text, nullable=True),
        sa.Column("answered_by", BigID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("attachments", sa.JSON, nullable=False),
        sa.Column("answered_at", DateTime3, nullable=True),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("category IN ('PAYMENT', 'QUOTE', 'SUPPLIER', 'ACCOUNT', 'ETC')", name="ck_inquiries_category"),
        sa.CheckConstraint("status IN ('WAITING', 'ANSWERED')", name="ck_inquiries_status"),
    )
    op.create_index("ix_inquiries_user_created", "inquiries", ["user_id", "created_at"])


def downgrade() -> None:
    # MariaDB: FK 가 쓰는 인덱스는 따로 지울 수 없어(1553) 표째 지운다
    op.drop_table("inquiries")
