"""제재 (data-model.md 9장 sanctions)."""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

SANCTION_TYPES = ("WARNING", "SUSPENSION", "BLIND", "UNSUSPEND")
WARNINGS_BEFORE_SUSPENSION = 3  # 경고 3회면 정지 (D-11, Q-34)


class Sanction(Base):
    __tablename__ = "sanctions"
    __table_args__ = (CheckConstraint(_in("type", SANCTION_TYPES), name="ck_sanctions_type"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    report_id: Mapped[int | None] = mapped_column(BigID)  # reports 테이블은 신고 기능에서 추가
    created_by: Mapped[int | None] = mapped_column(BigID, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
