"""견적서·견적서 버전 (data-model.md "quotes · quote_versions")."""
from datetime import date, datetime, time
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID, DateTime3
from app.models.request import Stage
from app.models.user import _in

UInt = Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql", "mariadb")
USmallInt = SmallInteger().with_variant(mysql.SMALLINT(unsigned=True), "mysql", "mariadb")

QUOTE_STATUSES = ("SENT", "CLOSED", "WITHDRAWN", "EXPIRED", "CONFIRMED")  # CLOSED = 다른 견적서 컨펌으로 자동 마감

# AC-F2-17, D-43·D-44: 최종 합계 = 항목 합 − 업체할인, 최소 10,000원
TOTAL_CHECK_EXPR = (
    "total_amount = amount_items + amount_transport + amount_install + amount_labor + amount_etc - discount_amount"
)
TOTAL_MIN_EXPR = "total_amount >= 10000"


class Quote(Base):
    """견적서 (FR QUOTE). 업체당 여러 개 가능 (D-6, label). 조건은 버전별로 quote_versions에 둔다."""

    __tablename__ = "quotes"
    __table_args__ = (CheckConstraint(_in("status", QUOTE_STATUSES), name="ck_quotes_status"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    stage_id: Mapped[int] = mapped_column(BigID, ForeignKey("stages.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(30), nullable=False)
    current_version: Mapped[int] = mapped_column(UInt, nullable=False, server_default="1")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="SENT")
    is_full_spec: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))  # AC-F2-19
    # 견적 요청(#32)으로 온 견적서면 그 요청 (0022 에서 외래 키). "내가 요청한 업체" 표시 (AC-F3-18)
    offer_id: Mapped[int | None] = mapped_column(BigID, ForeignKey("offers.id", name="fk_quotes_offer_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime3, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    stage: Mapped[Stage] = relationship()
    versions: Mapped[list["QuoteVersion"]] = relationship(
        back_populates="quote", order_by="QuoteVersion.version"
    )


class QuoteVersion(Base):
    """견적서 버전. 수정할 때마다 추가만 하고 수정·삭제하지 않는다 (AC-F2-20, CLAUDE.md 3장 5)."""

    __tablename__ = "quote_versions"
    __table_args__ = (
        UniqueConstraint("quote_id", "version", name="uq_quote_versions_version"),
        CheckConstraint(TOTAL_CHECK_EXPR, name="ck_quote_versions_total"),
        CheckConstraint(TOTAL_MIN_EXPR, name="ck_quote_versions_total_min"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    quote_id: Mapped[int] = mapped_column(BigID, ForeignKey("quotes.id"), nullable=False)
    version: Mapped[int] = mapped_column(UInt, nullable=False)
    based_on_perf_version: Mapped[int] = mapped_column(UInt, nullable=False)  # CHK-12
    venue_id: Mapped[int | None] = mapped_column(BigID)  # 공연장 견적서
    venue_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)  # 공간 조건 복사
    checkin_time: Mapped[time | None] = mapped_column(Time)  # CHK-02
    setup_available_time: Mapped[time | None] = mapped_column(Time)  # CHK-04
    setup_start: Mapped[time | None] = mapped_column(Time)
    setup_minutes: Mapped[int | None] = mapped_column(USmallInt)
    teardown_minutes: Mapped[int | None] = mapped_column(USmallInt)
    staff: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)  # [{role, count, start, end}]
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)  # [{name, category, qty, unitPrice, amount}]
    includes_equipment: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    includes_engineer: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    includes_install: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    includes_transport: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    amount_items: Mapped[int] = mapped_column(UInt, nullable=False)
    amount_transport: Mapped[int] = mapped_column(UInt, nullable=False)
    amount_install: Mapped[int] = mapped_column(UInt, nullable=False)
    amount_labor: Mapped[int] = mapped_column(UInt, nullable=False)
    amount_etc: Mapped[int] = mapped_column(UInt, nullable=False)
    discount_amount: Mapped[int] = mapped_column(UInt, nullable=False, server_default="0")  # 업체할인 (D-44)
    total_amount: Mapped[int] = mapped_column(UInt, nullable=False)
    extra_cost_note: Mapped[str | None] = mapped_column(String(500))
    valid_until: Mapped[date | None] = mapped_column(Date)
    tech_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())

    quote: Mapped[Quote] = relationship(back_populates="versions")
