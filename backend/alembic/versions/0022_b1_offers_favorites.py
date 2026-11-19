"""견적 요청(offers)·관심 업체(favorite_suppliers) (T1-11 #32, data-model.md 5장, AC-F3-16~19)

quotes.offer_id 에 offers 외래 키를 건다 (0010 에서 칸만 만들어 둠).

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "offers",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("stage_id", BigID, sa.ForeignKey("stages.id"), nullable=False),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("message", sa.String(300), nullable=True),
        sa.Column("decline_reason", sa.String(20), nullable=True),
        sa.Column("expires_at", DateTime3, nullable=False),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("stage_id", "supplier_id", name="uq_offers_stage_supplier"),
        sa.CheckConstraint("status IN ('PENDING', 'QUOTED', 'DECLINED', 'EXPIRED')", name="ck_offers_status"),
    )
    op.create_index("ix_offers_supplier_status", "offers", ["supplier_id", "status"])
    op.create_table(
        "favorite_suppliers",
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), primary_key=True),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
    )
    with op.batch_alter_table("quotes") as batch:
        batch.create_foreign_key("fk_quotes_offer_id", "offers", ["offer_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("quotes") as batch:
        batch.drop_constraint("fk_quotes_offer_id", type_="foreignkey")
    op.drop_table("favorite_suppliers")
    op.drop_index("ix_offers_supplier_status", table_name="offers")
    op.drop_table("offers")
