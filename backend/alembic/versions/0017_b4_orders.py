"""통합 청구서 orders · order_lines (T4-05 #50, FR-PAY-01, AC-F5-03·04)

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
# 공연당 유효 청구서 하나 (data-model.md orders.active_guard)
ACTIVE_GUARD_EXPR = "CASE WHEN status IN ('ISSUED', 'PAID', 'SETTLEMENT_SCHEDULED') THEN performance_id ELSE NULL END"

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("performance_id", BigID, sa.ForeignKey("performances.id"), nullable=False),
        sa.Column("status", sa.String(25), nullable=False, server_default="ISSUED"),
        sa.Column("items_total", UInt, nullable=False),
        sa.Column("platform_fee", UInt, nullable=False),
        sa.Column("total_amount", UInt, nullable=False),
        sa.Column("issued_at", DateTime3, nullable=False),
        sa.Column("paid_at", DateTime3, nullable=True),
        sa.Column("active_guard", BigID, sa.Computed(ACTIVE_GUARD_EXPR, persisted=True)),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('ISSUED', 'PAID', 'SETTLEMENT_SCHEDULED', 'CANCELLED')", name="ck_orders_status"),
        sa.CheckConstraint("total_amount = items_total + platform_fee", name="ck_orders_total"),
        sa.UniqueConstraint("active_guard", name="uq_orders_active_guard"),
    )
    op.create_table(
        "order_lines",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("order_id", BigID, sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("stage_id", BigID, sa.ForeignKey("stages.id"), nullable=False),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("quote_version_id", BigID, sa.ForeignKey("quote_versions.id"), nullable=False),
        sa.Column("amount", UInt, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("order_lines")
    op.drop_table("orders")
