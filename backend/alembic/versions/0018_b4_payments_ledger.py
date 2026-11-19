"""모의 결제 payments · 에스크로 장부 ledger_entries (T4-06 #51, FR-PAY-02, AC-F5-05~07)

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("order_id", BigID, sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("provider_tx_id", sa.String(64), nullable=True),
        sa.Column("amount", UInt, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("completed_at", DateTime3, nullable=True),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')", name="ck_payments_status"),
        sa.UniqueConstraint("idempotency_key", name="uq_payments_idempotency_key"),
        sa.UniqueConstraint("provider_tx_id", name="uq_payments_provider_tx_id"),
    )
    op.create_table(
        "ledger_entries",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("order_id", BigID, sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=True),
        sa.Column("entry_type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("memo", sa.String(200), nullable=False),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "entry_type IN ('HOLD', 'SETTLE_SCHEDULED', 'REFUND', 'PENALTY', 'CANCEL_FEE', 'PLATFORM_FEE')",
            name="ck_ledger_entries_type",
        ),
    )


def downgrade() -> None:
    op.drop_table("ledger_entries")
    op.drop_table("payments")
