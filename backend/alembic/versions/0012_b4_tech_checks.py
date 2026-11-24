"""기술 확인 tech_checks (T4-04 #49, data-model.md 7장, AC-F3-25)

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

# 모델이 나중에 바뀌어도 이 파일의 결과가 바뀌지 않도록 모델을 import 하지 않고 여기 적는다
UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tech_checks",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("performance_id", BigID, sa.ForeignKey("performances.id"), nullable=False),
        sa.Column("item", sa.String(200), nullable=False),
        sa.Column("detail", sa.String(200)),
        sa.Column("created_by_supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("owner_supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("answer", sa.String(20), nullable=False, server_default="UNCONFIRMED"),
        sa.Column("memo", sa.String(500)),
        sa.Column("target_perf_version", UInt),
        sa.Column("target_quote_version_id", BigID, sa.ForeignKey("quote_versions.id")),
        sa.Column("answered_at", DateTime3),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "answer IN ('UNCONFIRMED', 'OK', 'CONDITIONAL', 'IMPOSSIBLE', 'RECHECK')", name="ck_tech_checks_answer"
        ),
    )
    op.create_index("ix_tech_checks_performance", "tech_checks", ["performance_id", "id"])
    op.create_index("ix_tech_checks_owner_supplier_id", "tech_checks", ["owner_supplier_id"])


def downgrade() -> None:
    # MariaDB: FK 가 쓰는 인덱스는 따로 지울 수 없어(1553) 표째 지운다
    op.drop_table("tech_checks")
