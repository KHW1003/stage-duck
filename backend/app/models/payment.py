"""통합 청구서·모의 결제·장부 (data-model.md 8장 orders · order_lines · payments · ledger_entries,
FR-PAY-01·02 · AC-F5-03~07). 묶음 4.

공연당 유효 청구서는 하나다 (active_guard 생성 컬럼 + UNIQUE, CLAUDE.md 3장 14). 금액은 원 단위 정수.
장부는 추가만 한다 — 돈의 상태(보관 중 HOLD → 정산 예정 SETTLE_SCHEDULED)는 줄을 더해서 나타낸다.
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, Computed, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigID, DateTime3
from app.models.request import UInt, UTinyInt
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


PAYMENT_STATUSES = ("PENDING", "SUCCEEDED", "FAILED", "CANCELLED")
LEDGER_TYPES = ("HOLD", "SETTLE_SCHEDULED", "REFUND", "PENALTY", "CANCEL_FEE", "PLATFORM_FEE")


class Payment(Base):
    """테스트 결제 한 번 (AC-F5-05·06). 같은 Idempotency-Key·같은 모의 결제 번호는 한 번만 (UNIQUE)."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(_in("status", PAYMENT_STATUSES), name="ck_payments_status"),
        UniqueConstraint("idempotency_key", name="uq_payments_idempotency_key"),
        UniqueConstraint("provider_tx_id", name="uq_payments_provider_tx_id"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(BigID, ForeignKey("orders.id"), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_tx_id: Mapped[str | None] = mapped_column(String(64))
    amount: Mapped[int] = mapped_column(UInt, nullable=False)  # 서버 계산값
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="PENDING")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime3)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())


CANCEL_REQUESTERS = ("USER", "SUPPLIER", "SYSTEM")
CANCEL_PHASES = ("BEFORE_PAYMENT", "GRACE_12H", "D30_PLUS", "D29_D15", "D14_D8", "D7_D2", "D1", "D0", "SUPPLIER_FAULT")


class Cancellation(Base):
    """취소 한 번 (AC-F5-08~10, D-57). order_id 가 비면 결제 전 취소. 금액은 payment/calc.cancel_amounts 결과."""

    __tablename__ = "cancellations"
    __table_args__ = (
        CheckConstraint(_in("requested_by", CANCEL_REQUESTERS), name="ck_cancellations_requested_by"),
        CheckConstraint(_in("phase", CANCEL_PHASES), name="ck_cancellations_phase"),
    )

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    performance_id: Mapped[int] = mapped_column(BigID, ForeignKey("performances.id"), nullable=False)
    order_id: Mapped[int | None] = mapped_column(BigID, ForeignKey("orders.id"))
    requested_by: Mapped[str] = mapped_column(String(10), nullable=False)
    fault_supplier_id: Mapped[int | None] = mapped_column(BigID, ForeignKey("suppliers.id"))
    phase: Mapped[str] = mapped_column(String(20), nullable=False)
    rate_percent: Mapped[int] = mapped_column(UTinyInt, nullable=False)
    penalty_total: Mapped[int] = mapped_column(UInt, nullable=False)
    refund_total: Mapped[int] = mapped_column(UInt, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())


class LedgerEntry(Base):
    """에스크로 장부 한 줄 (추가만). supplier_id 가 비면 플랫폼 몫."""

    __tablename__ = "ledger_entries"
    __table_args__ = (CheckConstraint(_in("entry_type", LEDGER_TYPES), name="ck_ledger_entries_type"),)

    id: Mapped[int] = mapped_column(BigID, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(BigID, ForeignKey("orders.id"), nullable=False)
    supplier_id: Mapped[int | None] = mapped_column(BigID, ForeignKey("suppliers.id"))
    entry_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # 부호 있음
    memo: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime3, nullable=False, server_default=func.now())
