"""반려 기록 (data-model.md 9장 rejection_events, FR-POL-02 · AC-F4-05·06).

견적서를 받은 공고를 사용자가 내리거나(직접), 채팅을 시작한 공연을 결제 전에 취소하면(D-57) 한 줄 쌓인다.
지우지 않는다 — 카운트는 계산할 때 마지막 반려 후 180일로 끊는다 (request/calc.posting_limit).
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

REJECTION_KINDS = ("AFTER_CHAT", "NO_CHAT")


class RejectionEvent(Base):
    __tablename__ = "rejection_events"
    __table_args__ = (
        CheckConstraint(_in("kind", REJECTION_KINDS), name="ck_rejection_events_kind"),
        Index("ix_rejection_events_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    performance_id: Mapped[int] = mapped_column(BigID, ForeignKey("performances.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)
