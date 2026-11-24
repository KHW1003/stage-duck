"""견적 요청(직접 오퍼)·관심 업체 (data-model.md 5장, FR-OFFER-01~03, AC-F3-16~19, 이슈 #32).

화면 문구는 "견적 요청" (11/19 팀 결정), 코드·표 이름은 명세대로 offer 를 쓴다.
- offers: 사용자가 열린 단계에 업체를 골라 보낸 견적 요청. 같은 단계·같은 업체는 한 번 (UNIQUE).
  단계당 동시 10곳 제한은 서비스에서 단계 행을 잠그고 센다 (AC-F3-17).
  PENDING → QUOTED(업체가 견적서를 보냄) / DECLINED(업체 거절) / EXPIRED(48시간 지남, 읽을 때 바꾼다)
- favorite_suppliers: 사용자가 저장한 관심 업체 (AC-F3-16·19)
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

OFFER_STATUSES = ("PENDING", "QUOTED", "DECLINED", "EXPIRED")
OFFER_DECLINE_REASONS = ("SCHEDULE", "CAPACITY", "REGION", "BUDGET", "ETC")  # 일정 · 규모 · 지역 · 예산 · 기타


class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = (
        UniqueConstraint("stage_id", "supplier_id", name="uq_offers_stage_supplier"),
        CheckConstraint(_in("status", OFFER_STATUSES), name="ck_offers_status"),
        Index("ix_offers_supplier_status", "supplier_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    stage_id: Mapped[int] = mapped_column(BigID, ForeignKey("stages.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="PENDING")
    message: Mapped[str | None] = mapped_column(String(300))  # 사용자가 남긴 한마디 (연락처 모양이면 받지 않는다)
    decline_reason: Mapped[str | None] = mapped_column(String(20))
    expires_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())


class FavoriteSupplier(Base):
    __tablename__ = "favorite_suppliers"

    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), primary_key=True)
    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
