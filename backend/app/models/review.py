"""공연 후기·평점 (specs/reviews.md). 결제하고 공연이 끝난 사용자만, 확정한 단계(업체)마다 한 번.

supplier_id 는 쓸 때의 확정 업체를 그대로 적어 둔다 (업체 프로필에서 바로 모으려고).
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("stage_id", name="uq_reviews_stage"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
        Index("ix_reviews_supplier_id", "supplier_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    performance_id: Mapped[int] = mapped_column(BigID, ForeignKey("performances.id"), nullable=False)
    stage_id: Mapped[int] = mapped_column(BigID, ForeignKey("stages.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
