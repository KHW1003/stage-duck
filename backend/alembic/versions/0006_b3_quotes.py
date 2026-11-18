"""견적서·견적서 버전, stages.confirmed_quote_version_id FK (T3-01 #41, data-model.md "quotes · quote_versions")

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

# 모델이 나중에 바뀌어도 이 파일의 결과가 바뀌지 않도록 모델을 import 하지 않고 여기 적는다
UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
USmallInt = sa.SmallInteger().with_variant(mysql.SMALLINT(unsigned=True), "mysql", "mariadb")
FALSE = sa.text("0")
FK_NAME = "fk_stages_confirmed_quote_version_id"

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def _is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def upgrade() -> None:
    op.create_table(
        "quotes",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("stage_id", BigID, sa.ForeignKey("stages.id"), nullable=False),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("label", sa.String(30), nullable=False),
        sa.Column("current_version", UInt, nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="SENT"),
        sa.Column("is_full_spec", sa.Boolean, nullable=False, server_default=FALSE),
        sa.Column("offer_id", BigID),  # FK는 offers 만들 때 (#32)
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('SENT', 'CLOSED', 'WITHDRAWN', 'EXPIRED', 'CONFIRMED')", name="ck_quotes_status"
        ),
    )
    op.create_table(
        "quote_versions",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("quote_id", BigID, sa.ForeignKey("quotes.id"), nullable=False),
        sa.Column("version", UInt, nullable=False),
        sa.Column("based_on_perf_version", UInt, nullable=False),
        sa.Column("venue_id", BigID),
        sa.Column("venue_snapshot", sa.JSON),
        sa.Column("checkin_time", sa.Time),
        sa.Column("setup_available_time", sa.Time),
        sa.Column("setup_start", sa.Time),
        sa.Column("setup_minutes", USmallInt),
        sa.Column("teardown_minutes", USmallInt),
        sa.Column("staff", sa.JSON, nullable=False),
        sa.Column("items", sa.JSON, nullable=False),
        sa.Column("includes_equipment", sa.Boolean, nullable=False, server_default=FALSE),
        sa.Column("includes_engineer", sa.Boolean, nullable=False, server_default=FALSE),
        sa.Column("includes_install", sa.Boolean, nullable=False, server_default=FALSE),
        sa.Column("includes_transport", sa.Boolean, nullable=False, server_default=FALSE),
        sa.Column("amount_items", UInt, nullable=False),
        sa.Column("amount_transport", UInt, nullable=False),
        sa.Column("amount_install", UInt, nullable=False),
        sa.Column("amount_labor", UInt, nullable=False),
        sa.Column("amount_etc", UInt, nullable=False),
        sa.Column("discount_amount", UInt, nullable=False, server_default="0"),
        sa.Column("total_amount", UInt, nullable=False),
        sa.Column("extra_cost_note", sa.String(500)),
        sa.Column("valid_until", sa.Date),
        sa.Column("tech_note", sa.Text),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("quote_id", "version", name="uq_quote_versions_version"),
        sa.CheckConstraint(
            "total_amount = amount_items + amount_transport + amount_install + amount_labor + amount_etc"
            " - discount_amount",
            name="ck_quote_versions_total",
        ),
        sa.CheckConstraint("total_amount >= 10000", name="ck_quote_versions_total_min"),
    )
    # 0005 에서 칸만 만들어 둔 것에 FK를 건다 (request.py 주석).
    # SQLite는 FK만 더하는 ALTER가 없고, 표를 다시 만드는 batch는 생성 컬럼(open_guard) 복사에서 실패해 건너뛴다.
    if not _is_sqlite():
        op.create_foreign_key(
            FK_NAME, "stages", "quote_versions", ["confirmed_quote_version_id"], ["id"]
        )


def downgrade() -> None:
    if not _is_sqlite():
        op.drop_constraint(FK_NAME, "stages", type_="foreignkey")
    op.drop_table("quote_versions")
    op.drop_table("quotes")
