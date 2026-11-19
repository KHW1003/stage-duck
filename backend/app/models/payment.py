"""통합 청구서 (data-model.md 8장 orders · order_lines, FR-PAY-01 · AC-F5-03·04). 묶음 4.

공연당 유효 청구서는 하나다 (active_guard 생성 컬럼 + UNIQUE, CLAUDE.md 3장 14). 금액은 원 단위 정수.
payments · ledger_entries 는 #51 에서 더한다.
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, Computed, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID, DateTime3
from app.models.request import UInt
from app.models.user import _in

ORDER_STATUSES = ("ISSUED", "PAID", "SETTLEMENT_SCHEDULED", "CANCELLED")
ACTIVE_GUARD_EXPR = "CASE WHEN status IN ('ISSUED', 'PAID', 'SETTLEMENT_SCHEDULED') THEN performance_id ELSE NULL END"


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(_in("status", ORDER_STATUSES), name="ck_orders_status"),
        CheckConstraint("total_amount = items_total + platform_fee", name="ck_orders_total"),
        UniqueConstraint("active_guard", name="uq_orders_active_guard"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    performance_id: Mapped[int] = mapped_column(BigID, ForeignKey("performances.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(25), nullable=False, server_default="ISSUED")
    items_total: Mapped[int] = mapped_column(UInt, nullable=False)  # 확정 견적서 금액 합 (업체 금액)
    platform_fee: Mapped[int] = mapped_column(UInt, nullable=False)  # 플랫폼 이용료 (D-18)
    total_amount: Mapped[int] = mapped_column(UInt, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime3)
    active_guard: Mapped[int | None] = mapped_column(BigID, Computed(ACTIVE_GUARD_EXPR, persisted=True))
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())

    lines: Mapped[list["OrderLine"]] = relationship(order_by="OrderLine.id", lazy="selectin")


class OrderLine(Base):
    """업체별 금액 한 줄 (위약금 비율 배분 기준, AC-F5-08)."""

    __tablename__ = "order_lines"

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(BigID, ForeignKey("orders.id"), nullable=False)
    stage_id: Mapped[int] = mapped_column(BigID, ForeignKey("stages.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(BigID, ForeignKey("suppliers.id"), nullable=False)
    quote_version_id: Mapped[int] = mapped_column(BigID, ForeignKey("quote_versions.id"), nullable=False)
    amount: Mapped[int] = mapped_column(UInt, nullable=False)
