"""회원·업체·제재·상태 이력 (관리자 화면 기반)

Revision ID: 0001
Revises:
Create Date: 2026-11-12
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

NOW = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("birth_date", sa.Date),
        sa.Column("nickname", sa.String(30), unique=True),
        sa.Column("signup_purpose", sa.String(30)),
        sa.Column("musician_type", sa.String(20)),
        sa.Column("signup_channel", sa.String(30)),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("warning_count", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("failed_login_count", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("locked_until", DateTime3),
        sa.Column("created_at", DateTime3, nullable=False, server_default=NOW),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=NOW),
        sa.CheckConstraint("role IN ('USER', 'SUPPLIER', 'ADMIN')", name="ck_users_role"),
        sa.CheckConstraint("status IN ('ACTIVE', 'SUSPENDED', 'WITHDRAWN')", name="ck_users_status"),
    )
    op.create_table(
        "suppliers",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("business_type", sa.String(20), nullable=False),
        sa.Column("company_name", sa.String(100), nullable=False),
        sa.Column("representative_name", sa.String(50), nullable=False),
        sa.Column("business_reg_no", sa.String(10)),
        sa.Column("business_reg_file", sa.String(255)),
        sa.Column("business_address", sa.String(255)),
        sa.Column("main_phone", sa.String(20), nullable=False),
        sa.Column("mail_order_no", sa.String(50)),
        sa.Column("intro", sa.Text),
        sa.Column("photo_url", sa.String(255)),
        sa.Column("setup_minutes", sa.SmallInteger),
        sa.Column("teardown_minutes", sa.SmallInteger),
        sa.Column("engineer_years", sa.SmallInteger),
        sa.Column("band_experience", sa.Boolean),
        sa.Column("has_liability_insurance", sa.Boolean),
        sa.Column("sound_certification", sa.String(100)),
        sa.Column("review_status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("reject_reason", sa.String(500)),
        sa.Column("approved_at", DateTime3),
        sa.Column("created_at", DateTime3, nullable=False, server_default=NOW),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=NOW),
        sa.CheckConstraint("business_type IN ('INDIVIDUAL', 'SOLE_PROPRIETOR', 'CORPORATION')", name="ck_suppliers_business_type"),
        sa.CheckConstraint("review_status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')", name="ck_suppliers_review_status"),
    )
    op.create_table(
        "supplier_categories",
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), primary_key=True),
        sa.Column("category", sa.String(20), primary_key=True),
        sa.CheckConstraint("category IN ('VENUE', 'EQUIPMENT', 'INSTALL', 'ENGINEER')", name="ck_supplier_categories_category"),
    )
    op.create_table(
        "sanctions",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("report_id", BigID),
        sa.Column("created_by", BigID, sa.ForeignKey("users.id")),
        sa.Column("created_at", DateTime3, nullable=False, server_default=NOW),
        sa.CheckConstraint("type IN ('WARNING', 'SUSPENSION', 'BLIND', 'UNSUSPEND')", name="ck_sanctions_type"),
    )
    op.create_table(
        "status_histories",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", BigID, nullable=False),
        sa.Column("from_status", sa.String(25)),
        sa.Column("to_status", sa.String(25), nullable=False),
        sa.Column("actor_user_id", BigID),
        sa.Column("reason", sa.String(500)),
        sa.Column("created_at", DateTime3, nullable=False, server_default=NOW),
    )
    op.create_index("ix_status_histories_entity", "status_histories", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_index("ix_status_histories_entity", table_name="status_histories")
    op.drop_table("status_histories")
    op.drop_table("sanctions")
    op.drop_table("supplier_categories")
    op.drop_table("suppliers")
    op.drop_table("users")
