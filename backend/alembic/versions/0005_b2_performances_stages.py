"""공연 요청서·버전·배정 단계 (T2-02 #36, data-model.md 4장)

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

# 모델이 나중에 바뀌어도 이 파일의 결과가 바뀌지 않도록 모델을 import 하지 않고 여기 적는다
UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
USmallInt = sa.SmallInteger().with_variant(mysql.SMALLINT(unsigned=True), "mysql", "mariadb")
UTinyInt = sa.SmallInteger().with_variant(mysql.TINYINT(unsigned=True), "mysql", "mariadb")
OPEN_GUARD_EXPR = "CASE WHEN status IN ('OPEN', 'NEGOTIATING') THEN performance_id ELSE NULL END"

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "performances",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("current_version", UInt, nullable=False, server_default="1"),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("form", sa.String(20), nullable=False),
        sa.Column("show_date", sa.Date, nullable=False),
        sa.Column("rehearsal_start", sa.Time, nullable=False),
        sa.Column("show_start", sa.Time, nullable=False),
        sa.Column("show_end", sa.Time, nullable=False),
        sa.Column("audience", USmallInt, nullable=False),
        sa.Column("sido", sa.String(20), nullable=False),
        sa.Column("sigungu", sa.String(30), nullable=False),
        sa.Column("contact_phone", sa.String(20)),
        sa.Column("needs", sa.JSON, nullable=False),
        sa.Column("published_at", DateTime3),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('DRAFT', 'PUBLISHED', 'ASSIGNING', 'AWAITING_PAYMENT', 'CONFIRMED', 'COMPLETED', "
            "'CANCELLED', 'WITHDRAWN')",
            name="ck_performances_status",
        ),
        sa.CheckConstraint(
            "form IN ('BAND', 'THEATER', 'TALK_EVENT', 'RELIGIOUS', 'ETC')", name="ck_performances_form"
        ),
        sa.CheckConstraint(
            "rehearsal_start < show_start AND show_start < show_end", name="ck_performances_times"
        ),
        sa.CheckConstraint("audience BETWEEN 1 AND 500", name="ck_performances_audience"),
    )
    op.create_table(
        "performance_versions",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("performance_id", BigID, sa.ForeignKey("performances.id"), nullable=False),
        sa.Column("version", UInt, nullable=False),
        sa.Column("snapshot", sa.JSON, nullable=False),
        sa.Column("changed_fields", sa.JSON, nullable=False),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("performance_id", "version", name="uq_performance_versions_version"),
    )
    op.create_table(
        "stages",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("performance_id", BigID, sa.ForeignKey("performances.id"), nullable=False),
        sa.Column("stage_type", sa.String(20), nullable=False),
        sa.Column("seq", UTinyInt, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="WAITING"),
        sa.Column("confirmed_quote_version_id", BigID),  # FK 는 3번 묶음 quote_versions 마이그레이션에서
        sa.Column("skip_ack_at", DateTime3),
        sa.Column("skip_ack_text_version", sa.String(10)),
        sa.Column("opened_at", DateTime3),
        sa.Column("confirmed_at", DateTime3),
        sa.Column("open_guard", BigID, sa.Computed(OPEN_GUARD_EXPR, persisted=True)),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("stage_type IN ('VENUE', 'EQUIPMENT', 'ENGINEER')", name="ck_stages_stage_type"),
        sa.CheckConstraint(
            "status IN ('WAITING', 'OPEN', 'NEGOTIATING', 'CONFIRMED', 'SKIPPED', 'RECHECK')",
            name="ck_stages_status",
        ),
        sa.UniqueConstraint("performance_id", "stage_type", name="uq_stages_performance_type"),
        sa.UniqueConstraint("open_guard", name="uq_stages_open_guard"),
    )


def downgrade() -> None:
    op.drop_table("stages")
    op.drop_table("performance_versions")
    op.drop_table("performances")
