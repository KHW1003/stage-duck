"""채팅방·메시지·읽음 (T3-02 #42, data-model.md 6장 chat_rooms · chat_messages · chat_reads)

confirm_requests(견적 내역 확인 카드)는 #43 에서 따로 만든다.

Revision ID: 0011
Revises: 0010 (공간 0010_b1_venues 와 번호가 겹쳐 0011로 옮김)
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

from app.core.db import BigID, DateTime3

# 모델이 나중에 바뀌어도 이 파일의 결과가 바뀌지 않도록 모델을 import 하지 않고 여기 적는다
FALSE = sa.text("0")

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_rooms",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("stage_id", BigID, sa.ForeignKey("stages.id"), nullable=False),
        sa.Column("supplier_id", BigID, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("started_at", DateTime3),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("stage_id", "supplier_id", name="uq_chat_rooms_stage_supplier"),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", BigID, primary_key=True, autoincrement=True),
        sa.Column("room_id", BigID, sa.ForeignKey("chat_rooms.id"), nullable=False),
        sa.Column("sender_user_id", BigID, sa.ForeignKey("users.id")),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("body", sa.Text),
        sa.Column("file_id", BigID, sa.ForeignKey("files.id")),
        sa.Column("ref_id", BigID),
        sa.Column("contact_warning", sa.Boolean, nullable=False, server_default=FALSE),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "type IN ('TEXT', 'IMAGE', 'FILE', 'QUOTE', 'CONFIRM_REQUEST', 'CONFIRMED', 'NOTICE')",
            name="ck_chat_messages_type",
        ),
    )
    op.create_index("ix_chat_messages_room_id_id", "chat_messages", ["room_id", "id"])
    op.create_table(
        "chat_reads",
        sa.Column("room_id", BigID, sa.ForeignKey("chat_rooms.id"), primary_key=True),
        sa.Column("user_id", BigID, sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("last_read_message_id", BigID),
        sa.Column("pinned_at", DateTime3),
        sa.Column("created_at", DateTime3, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", DateTime3, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("chat_reads")
    # ix_chat_messages_room_id_id 는 room_id FK 가 쓰고 있어 따로 지울 수 없다 (MariaDB 1553). 테이블과 함께 지워진다.
    op.drop_table("chat_messages")
    op.drop_table("chat_rooms")
