"""채팅 답장 chat_messages.reply_to_id (11/24 해원: 메시지에 답장하기)

Revision ID: 0028
Revises: 0027
Create Date: 2026-11-24
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 답장한 원래 메시지. 시연 초기화처럼 방 메시지를 한꺼번에 지워도 막히지 않게 SET NULL
    op.add_column("chat_messages", sa.Column("reply_to_id", BigID, nullable=True))
    op.create_foreign_key(
        "fk_chat_messages_reply_to_id", "chat_messages", "chat_messages", ["reply_to_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_chat_messages_reply_to_id", "chat_messages", type_="foreignkey")
    op.drop_column("chat_messages", "reply_to_id")
