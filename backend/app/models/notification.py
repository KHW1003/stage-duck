"""사이트 안 알림 (specs/notifications.md 4장, D-52, 이슈 #45).

문구(title·body)는 만들 때 확정해 저장한다 — 나중에 상호·제목이 바뀌어도 그때 문구 그대로.
연락처·계좌·상대 실명은 넣지 않는다 (CLAUDE.md 20). payload 는 참조 id 만.
"""
from datetime import datetime

from sqlalchemy import JSON, Boolean, ForeignKey, Index, String, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3

NOTIFICATION_CATEGORIES = ("QUOTE_CHAT", "OFFER", "POSTING", "PAYMENT", "ADMIN", "COMMUNITY")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id", "user_id", "id"),
        Index("ix_notifications_user_read", "user_id", "read_at"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    body: Mapped[str | None] = mapped_column(String(200))
    link: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON)
    read_at: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())


class NotificationSetting(Base):
    """알림 받는 방법 (메일 알림 켜기·끄기). 줄이 없으면 기본값(메일 켬)."""

    __tablename__ = "notification_settings"

    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), primary_key=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    updated_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now(), onupdate=func.now())
