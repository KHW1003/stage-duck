"""공간 조회 수 venues.view_count (11/25 해원: 메인 공간 예시를 조회수 많은 순으로)

Revision ID: 0030
Revises: 0029
Create Date: 2026-11-25
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None

UInt = sa.Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")


def upgrade() -> None:
    op.add_column("venues", sa.Column("view_count", UInt, nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("venues", "view_count")
