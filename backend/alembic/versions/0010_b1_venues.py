"""공간·기본 장비 (T1-06 #27, data-model.md 3장 venues·venue_equipment)

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

from app.core.db import BigID

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

# 모델이 바뀌어도 이 파일 결과가 그대로이도록 모델을 import 하지 않는다
UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
USmallInt = sa.SmallInteger().with_variant(mysql.SMALLINT(unsigned=True), "mysql", "mariadb")


def upgrade() -> None:
    op.create_table(
        "venues",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sido", sa.String(20), nullable=False),
        sa.Column("sigungu", sa.String(30), nullable=False),
        sa.Column("address", sa.String(255), nullable=False),
        sa.Column("venue_type", sa.String(20), nullable=False),
        sa.Column("max_capacity", USmallInt, nullable=False),
        sa.Column("checkin_time", sa.Time, nullable=False),
        sa.Column("checkout_time", sa.Time, nullable=False),
        sa.Column("rental_fee", UInt, nullable=False),
        sa.Column("has_resident_engineer", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("band_allowed", sa.Boolean),
        sa.Column("external_equipment_allowed", sa.Boolean),
        sa.Column("external_engineer_allowed", sa.Boolean),
        sa.Column("has_waiting_room", sa.Boolean),
        sa.Column("has_stage_platform", sa.Boolean),
        sa.Column("has_parking", sa.Boolean),
        sa.Column("hall_registered", sa.Boolean),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.CheckConstraint(
            "venue_type IN ('CONCERT_HALL', 'CULTURE_SPACE', 'ROOFTOP', 'GARDEN', 'WAREHOUSE', 'ETC')",
            name="ck_venues_venue_type",
        ),
        sa.CheckConstraint("status IN ('ACTIVE', 'HIDDEN')", name="ck_venues_status"),
        sa.CheckConstraint("max_capacity BETWEEN 1 AND 500", name="ck_venues_max_capacity"),
        sa.CheckConstraint("checkout_time > checkin_time", name="ck_venues_checkout_after_checkin"),
    )
    op.create_index("ix_venues_supplier_id", "venues", ["supplier_id"])
    op.create_index("ix_venues_sido_sigungu", "venues", ["sido", "sigungu"])
    op.create_table(
        "venue_equipment",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("venue_id", BigID, sa.ForeignKey("venues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("quantity", USmallInt, nullable=False),
    )
    op.create_index("ix_venue_equipment_venue_id", "venue_equipment", ["venue_id"])


def downgrade() -> None:
    op.drop_table("venue_equipment")
    op.drop_table("venues")
