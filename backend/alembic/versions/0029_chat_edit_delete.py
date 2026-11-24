"""채팅 메시지 수정·삭제 시각 chat_messages.edited_at · deleted_at (11/24 해원)

Revision ID: 0029
Revises: 0028
Create Date: 2026-11-24
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import DateTime3

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("edited_at", DateTime3, nullable=True))
    # 지운 메시지는 행을 남기고(답장·읽음 위치가 깨지지 않게) 내용만 비운다
    op.add_column("chat_messages", sa.Column("deleted_at", DateTime3, nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "deleted_at")
    op.drop_column("chat_messages", "edited_at")
