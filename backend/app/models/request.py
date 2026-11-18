"""공연 요청서·버전·배정 단계 (data-model.md 4장 performances, performance_versions, stages)."""
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Computed,
    Date,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID, DateTime3
from app.models.user import _in

UInt = Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
USmallInt = SmallInteger().with_variant(mysql.SMALLINT(unsigned=True), "mysql", "mariadb")
UTinyInt = SmallInteger().with_variant(mysql.TINYINT(unsigned=True), "mysql", "mariadb")

PERFORMANCE_STATUSES = (
    "DRAFT", "PUBLISHED", "ASSIGNING", "AWAITING_PAYMENT", "CONFIRMED", "COMPLETED", "CANCELLED", "WITHDRAWN",
)
PERFORMANCE_FORMS = ("BAND", "THEATER", "TALK_EVENT", "RELIGIOUS", "ETC")
STAGE_TYPES = ("VENUE", "EQUIPMENT", "ENGINEER")
STAGE_STATUSES = ("WAITING", "OPEN", "NEGOTIATING", "CONFIRMED", "SKIPPED", "RECHECK")
AUDIENCE_MIN, AUDIENCE_MAX = 1, 500  # AC-F2-04

# 공연당 열린 단계 1개 (AC-F3-01). MariaDB에는 조건부 유니크가 없어 생성 컬럼 + UNIQUE 로 막는다.
# data-model.md 의 IF(...) 와 같은 뜻이며, SQLite 테스트에서도 돌도록 CASE 로 적는다.
OPEN_GUARD_EXPR = "CASE WHEN status IN ('OPEN', 'NEGOTIATING') THEN performance_id ELSE NULL END"


class Performance(Base):
    """공연 요청서 (FR REQ-01·02). title 등 칸은 현재 버전 값이고, 버전별 원본은 performance_versions."""

    __tablename__ = "performances"
    __table_args__ = (
        CheckConstraint(_in("status", PERFORMANCE_STATUSES), name="ck_performances_status"),
        CheckConstraint(_in("form", PERFORMANCE_FORMS), name="ck_performances_form"),
        CheckConstraint(
            "rehearsal_start < show_start AND show_start < show_end", name="ck_performances_times"
        ),  # AC-F2-05
        CheckConstraint(
            f"audience BETWEEN {AUDIENCE_MIN} AND {AUDIENCE_MAX}", name="ck_performances_audience"
        ),  # AC-F2-04
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigID, ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="DRAFT")
    current_version: Mapped[int] = mapped_column(UInt, nullable=False, server_default="1")
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    form: Mapped[str] = mapped_column(String(20), nullable=False)
    show_date: Mapped[date] = mapped_column(Date, nullable=False)  # 오늘 + 14일 이후는 서비스 검사 (AC-F2-06)
    rehearsal_start: Mapped[time] = mapped_column(Time, nullable=False)
    show_start: Mapped[time] = mapped_column(Time, nullable=False)
    show_end: Mapped[time] = mapped_column(Time, nullable=False)
    audience: Mapped[int] = mapped_column(USmallInt, nullable=False)
    sido: Mapped[str] = mapped_column(String(20), nullable=False)
    sigungu: Mapped[str] = mapped_column(String(30), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(20))  # 결제 후에만 공개
    needs: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)  # STEP2 전체
    published_at: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime3, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    versions: Mapped[list["PerformanceVersion"]] = relationship(
        back_populates="performance", order_by="PerformanceVersion.version"
    )
    stages: Mapped[list["Stage"]] = relationship(back_populates="performance", order_by="Stage.seq")


class PerformanceVersion(Base):
    """요청서 버전. 추가만 하고 수정·삭제하지 않는다 (constitution, CLAUDE.md 3장 5)."""

    __tablename__ = "performance_versions"
    __table_args__ = (UniqueConstraint("performance_id", "version", name="uq_performance_versions_version"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    performance_id: Mapped[int] = mapped_column(BigID, ForeignKey("performances.id"), nullable=False)
    version: Mapped[int] = mapped_column(UInt, nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)  # 그 버전의 STEP1+STEP2 전체
    changed_fields: Mapped[list[str]] = mapped_column(JSON, nullable=False)  # 이전 버전과 달라진 항목
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())

    performance: Mapped[Performance] = relationship(back_populates="versions")


class Stage(Base):
    """배정 단계 (공연장 → 장비 → 엔지니어, constitution 3)."""

    __tablename__ = "stages"
    __table_args__ = (
        CheckConstraint(_in("stage_type", STAGE_TYPES), name="ck_stages_stage_type"),
        CheckConstraint(_in("status", STAGE_STATUSES), name="ck_stages_status"),
        UniqueConstraint("performance_id", "stage_type", name="uq_stages_performance_type"),
        UniqueConstraint("open_guard", name="uq_stages_open_guard"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    performance_id: Mapped[int] = mapped_column(BigID, ForeignKey("performances.id"), nullable=False)
    stage_type: Mapped[str] = mapped_column(String(20), nullable=False)
    seq: Mapped[int] = mapped_column(UTinyInt, nullable=False)  # 1·2·3
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="WAITING")
    # FK → quote_versions 는 3번 묶음이 quote_versions 를 만들 때 그 마이그레이션에서 건다
    confirmed_quote_version_id: Mapped[int | None] = mapped_column(BigID)
    skip_ack_at: Mapped[datetime | None] = mapped_column(DateTime3)
    skip_ack_text_version: Mapped[str | None] = mapped_column(String(10))
    opened_at: Mapped[datetime | None] = mapped_column(DateTime3)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime3)
    open_guard: Mapped[int | None] = mapped_column(BigID, Computed(OPEN_GUARD_EXPR, persisted=True))
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime3, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    performance: Mapped[Performance] = relationship(back_populates="stages")
