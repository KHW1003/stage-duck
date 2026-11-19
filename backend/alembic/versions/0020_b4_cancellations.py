"""취소 기록 cancellations (T4-07 #52, FR-PAY-03, AC-F5-08~10, D-57)

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None

UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
UTinyInt = sa.SmallInteger().with_variant(mysql.TINYINT(unsigned=True), "mysql", "mariadb")


def upgrade() -> None:
    op.create_table(
        "cancellations",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("performance_id", BigID, sa.ForeignKey("performances.id"), nullable=False),
        sa.Column("order_id", BigID, sa.ForeignKey("orders.id"), nullable=True),
        sa.Column("requested_by", sa.String(10), nullable=False),
        sa.Column("fault_supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=True),
        sa.Column("phase", sa.String(20), nullable=False),
        sa.Column("rate_percent", UTinyInt, nullable=False),
        sa.Column("penalty_total", UInt, nullable=False),
        sa.Column("refund_total", UInt, nullable=False),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("requested_by IN ('USER', 'SUPPLIER', 'SYSTEM')", name="ck_cancellations_requested_by"),
        sa.CheckConstraint(
            "phase IN ('BEFORE_PAYMENT', 'GRACE_12H', 'D30_PLUS', 'D29_D15', 'D14_D8', 'D7_D2', 'D1', 'D0', 'SUPPLIER_FAULT')",
            name="ck_cancellations_phase",
        ),
    )


def downgrade() -> None:
    op.drop_table("cancellations")
