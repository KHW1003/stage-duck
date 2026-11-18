"""채팅방·메시지·읽음 (data-model.md 6장 "chat_rooms · chat_messages · chat_reads")."""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

MESSAGE_TYPES = ("TEXT", "IMAGE", "FILE", "QUOTE", "CONFIRM_REQUEST", "CONFIRMED", "NOTICE")


class ChatRoom(Base):
    """단계 × 업체 하나에 방 하나 (업체가 견적서를 여러 개 보내도 방은 하나)."""

    __tablename__ = "chat_rooms"
    __table_args__ = (UniqueConstraint("stage_id", "supplier_id", name="uq_chat_rooms_stage_supplier"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    stage_id: Mapped[int] = mapped_column(BigID, ForeignKey("stages.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)  # 공연 작성자 (조회 편의)
    started_at: Mapped[datetime | None] = mapped_column(DateTime3)  # NULL 이면 업체 메시지 불가 (AC-F3-06)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime3, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ChatMessage(Base):
    """채팅 메시지. sender_user_id 가 NULL 이면 시스템 메시지 (견적서 도착 등)."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint(_in("type", MESSAGE_TYPES), name="ck_chat_messages_type"),
        Index("ix_chat_messages_room_id_id", "room_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    room_id: Mapped[int] = mapped_column(BigID, ForeignKey("chat_rooms.id"), nullable=False)
    sender_user_id: Mapped[int | None] = mapped_column(BigID, ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    file_id: Mapped[int | None] = mapped_column(BigID, ForeignKey("files.id"))
    ref_id: Mapped[int | None] = mapped_column(BigID)  # quote_version_id 또는 confirm_request_id
    contact_warning: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))  # AC-F3-15
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())


class ChatRead(Base):
    """사람마다 방별 읽음 위치와 상단 고정 (AC-F3-08, AC-F3-27, D-56)."""

    __tablename__ = "chat_reads"

    room_id: Mapped[int] = mapped_column(BigID, ForeignKey("chat_rooms.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), primary_key=True)
    last_read_message_id: Mapped[int | None] = mapped_column(BigID)  # 고정만 하고 아직 안 읽었으면 NULL
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime3, nullable=False, server_default=func.now(), onupdate=func.now()
    )
