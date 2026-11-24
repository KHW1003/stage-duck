"""기술 확인 (data-model.md 7장 tech_checks, FR-TECH-01 · AC-F3-25).

엔지니어(또는 엔지니어 포함 장비 업체)가 항목을 정하고, 담당 업체(owner)만 답한다. 자동 판정은 없다.
detail(항목 설명 한 줄)은 목업 p-tech.html 의 작은 글씨 — data-model.md 에 더한다.
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

UInt = Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")

TECH_ANSWERS = ("UNCONFIRMED", "OK", "CONDITIONAL", "IMPOSSIBLE", "RECHECK")
ITEM_MAX = 200
DETAIL_MAX = 200
MEMO_MAX = 500


class TechCheck(Base):
    __tablename__ = "tech_checks"
    __table_args__ = (
        CheckConstraint(_in("answer", TECH_ANSWERS), name="ck_tech_checks_answer"),
        Index("ix_tech_checks_performance", "performance_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    performance_id: Mapped[int] = mapped_column(BigID, ForeignKey("performances.id"), nullable=False)
    item: Mapped[str] = mapped_column(String(ITEM_MAX), nullable=False)
    detail: Mapped[str | None] = mapped_column(String(DETAIL_MAX))
    created_by_supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False)
    owner_supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False, index=True)
    answer: Mapped[str] = mapped_column(String(20), nullable=False, server_default="UNCONFIRMED")
    memo: Mapped[str | None] = mapped_column(String(MEMO_MAX))
    target_perf_version: Mapped[int | None] = mapped_column(UInt)  # 답변 당시 요청서 버전
    target_quote_version_id: Mapped[int | None] = mapped_column(BigID, ForeignKey("quote_versions.id"))  # 답변 당시 내 확정 견적서
    answered_at: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now(), onupdate=func.now())
