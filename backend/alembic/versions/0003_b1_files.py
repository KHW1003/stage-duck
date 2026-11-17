"""업로드 파일 (#29, uploads.md 5장, D-51) + 업체 사진·서류 칸을 파일 id 로

- files 테이블을 만든다.
- suppliers.business_reg_file(글자) → business_doc_file_id(FK files), suppliers.photo_url(글자) → image_file_id(FK files).
  옛 칸은 쓰는 코드가 없고 값도 넣은 적이 없어 옮기지 않고 지운다.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-17
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

from app.core.db import BigID, DateTime3

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

NOW = sa.text("CURRENT_TIMESTAMP")
UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
USmallInt = sa.SmallInteger().with_variant(mysql.SMALLINT(unsigned=True), "mysql", "mariadb")


def upgrade() -> None:
    op.create_table(
        "files",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("owner_user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("visibility", sa.String(10), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="TEMP"),
        sa.Column("storage_key", sa.String(255), nullable=False, unique=True),
        sa.Column("thumb_key", sa.String(255)),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(50), nullable=False),
        sa.Column("size_bytes", UInt, nullable=False),
        sa.Column("width", USmallInt),
        sa.Column("height", USmallInt),
        sa.Column("created_at", DateTime3, nullable=False, server_default=NOW),
        sa.Column("attached_at", DateTime3),
        sa.CheckConstraint(
            "purpose IN ('PROFILE', 'SUPPLIER_IMAGE', 'VENUE', 'PR_POST', 'COMMUNITY', 'INQUIRY', 'CHAT', 'BUSINESS_DOC')",
            name="ck_files_purpose",
        ),
        sa.CheckConstraint("visibility IN ('PUBLIC', 'PRIVATE')", name="ck_files_visibility"),
        sa.CheckConstraint("status IN ('TEMP', 'ATTACHED', 'DELETED')", name="ck_files_status"),
    )
    op.create_index("ix_files_status_created_at", "files", ["status", "created_at"])

    with op.batch_alter_table("suppliers") as batch:
        batch.drop_column("business_reg_file")
        batch.drop_column("photo_url")
        batch.add_column(sa.Column("business_doc_file_id", BigID))
        batch.add_column(sa.Column("image_file_id", BigID))
        batch.create_foreign_key("fk_suppliers_business_doc_file_id", "files", ["business_doc_file_id"], ["id"])
        batch.create_foreign_key("fk_suppliers_image_file_id", "files", ["image_file_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("suppliers") as batch:
        batch.drop_constraint("fk_suppliers_image_file_id", type_="foreignkey")
        batch.drop_constraint("fk_suppliers_business_doc_file_id", type_="foreignkey")
        batch.drop_column("image_file_id")
        batch.drop_column("business_doc_file_id")
        batch.add_column(sa.Column("photo_url", sa.String(255)))
        batch.add_column(sa.Column("business_reg_file", sa.String(255)))
    op.drop_index("ix_files_status_created_at", table_name="files")
    op.drop_table("files")
