"""users.profile_file_id — 개인 프로필 사진 (T1-12 #33, FR-PROFILE-02, data-model.md users, uploads.md 5장)

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("profile_file_id", BigID))
        # 시연 초기화가 files 를 users 보다 먼저 지우므로 SET NULL (models/user.py)
        batch.create_foreign_key("fk_users_profile_file_id", "files", ["profile_file_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("fk_users_profile_file_id", type_="foreignkey")
        batch.drop_column("profile_file_id")
