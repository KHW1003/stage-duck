"""신고·제재 (data-model.md 9장 reports, sanctions)."""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

SANCTION_TYPES = ("WARNING", "SUSPENSION", "BLIND", "UNSUSPEND")
WARNINGS_BEFORE_SUSPENSION = 3  # 경고 3회면 정지 (D-11, Q-34)
REPORT_TARGET_TYPES = ("CHAT_ROOM", "PR_POST", "FREE_POST", "FREE_COMMENT", "USER")
REPORT_STATUSES = ("OPEN", "WARNED", "DISMISSED")


class Report(Base):
    """신고 (FR-POL-04). 같은 사람이 같은 대상을 두 번 신고해도 한 건 — UNIQUE 로 막는다."""

    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(_in("target_type", REPORT_TARGET_TYPES), name="ck_reports_target_type"),
        CheckConstraint(_in("status", REPORT_STATUSES), name="ck_reports_status"),
        UniqueConstraint("reporter_user_id", "target_type", "target_id", name="uq_reports_reporter_target"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    reporter_user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[int] = mapped_column(BigID, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="OPEN")
    handled_by: Mapped[int | None] = mapped_column(BigID, ForeignKey("users.id"))
    handled_at: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())


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
