"""취소·위약금·업체 사정 취소 (T4-07 #52, FR-PAY-03, AC-F5-08·09·10, D-39·D-53·D-57). 묶음 4.

금액은 payment/calc 의 순수 함수(cancel_phase·cancel_amounts)만 쓴다. 장부는 추가만 한다.
공연 상태(CANCELLED)·단계 다시 열기는 2번 묶음 몫이라 아직 바꾸지 않는다 (약속 함수가 생기면 여기서 부른다).
"""
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import invalid_state, not_found
from app.models.payment import Cancellation, LedgerEntry, Order
from app.models.request import Performance
from app.models.supplier import Supplier
from app.models.user import User
from app.payment import calc
from app.payment.service import _move_order, supplier_names
from app.policy import service as policy_service
from app.request import rejection

PAID_STATUSES = ("PAID",)  # 정산 예정(공연 끝) 뒤에는 취소하지 않는다
CANCELABLE_PERF = ("PUBLISHED", "ASSIGNING", "AWAITING_PAYMENT", "CONFIRMED")


@dataclass(frozen=True)
class CancelQuote:
    """GET /performances/{id}/cancel-quote 응답 (api-contract.md 6.1)."""

    amounts: calc.CancelAmounts
    by_supplier: list[tuple[int, str, int]]  # (업체 id, 상호, 위약금 몫)


def _owned(db: Session, user: User, performance_id: int, *, lock: bool = False) -> Performance:
    perf = db.get(Performance, performance_id, with_for_update=lock)
    if perf is None or perf.user_id != user.id:
        raise not_found()
    return perf


def _live_order(db: Session, performance_id: int, *, lock: bool = False) -> Order | None:
    stmt = select(Order).where(Order.performance_id == performance_id, Order.status.in_(("ISSUED", "PAID")))
    return db.scalar(stmt.with_for_update() if lock else stmt)


def _quote(db: Session, perf: Performance, order: Order | None, phase: str) -> CancelQuote:
    paid = order is not None and order.status in PAID_STATUSES
    lines = order.lines if paid else []
    amounts = calc.cancel_amounts([ln.amount for ln in lines], order.platform_fee if paid else 0, phase)
    names = supplier_names(db, [ln.supplier_id for ln in lines])
    by_supplier = [(ln.supplier_id, names.get(ln.supplier_id, ""), share) for ln, share in zip(lines, amounts.penalty_by_line)]
    return CancelQuote(amounts, by_supplier)


def _user_phase(perf: Performance, order: Order | None, now: datetime) -> str:
    paid_at = order.paid_at if order is not None and order.status in PAID_STATUSES else None
    return calc.cancel_phase(perf.show_date, now, paid_at=paid_at)


def cancel_quote(db: Session, user: User, performance_id: int, *, now: datetime) -> CancelQuote:
    """AC-F5-08·09: 지금 취소하면 내는 금액·환불 예정액 미리보기. 내 공연만 (남은 404)."""
    perf = _owned(db, user, performance_id)
    order = _live_order(db, perf.id)
    try:
        phase = _user_phase(perf, order, now)
    except ValueError:
        raise invalid_state("공연 날짜가 지나서 취소할 수 없어요.") from None
    return _quote(db, perf, order, phase)


def _record(db: Session, perf: Performance, order: Order | None, q: CancelQuote, *, requested_by: str,
            fault_supplier_id: int | None, actor_id: int | None) -> Cancellation:
    a = q.amounts
    paid = order is not None and order.status in PAID_STATUSES
    if order is not None:
        _move_order(db, order, "CANCELLED", actor_id)
    if paid:
        db.add_all(LedgerEntry(order_id=order.id, supplier_id=sid, entry_type="PENALTY", amount=share, memo="취소 위약금 (업체 몫)")
                   for sid, _, share in q.by_supplier if share)
        if a.refund_total:
            db.add(LedgerEntry(order_id=order.id, supplier_id=None, entry_type="REFUND", amount=-a.refund_total,
                               memo="사용자 환불 예정"))
    c = Cancellation(performance_id=perf.id, order_id=order.id if order else None, requested_by=requested_by,
                     fault_supplier_id=fault_supplier_id, phase=a.phase, rate_percent=a.rate_percent,
                     penalty_total=a.penalty_total, refund_total=a.refund_total)
    db.add(c)
    db.flush()
    return c


def _user_cancelled(db: Session, performance_id: int) -> bool:
    """사용자가 이미 취소한 공연 (업체 사정 취소 뒤 다시 모집·결제한 공연은 사용자 취소 가능)."""
    stmt = select(Cancellation.id).where(Cancellation.performance_id == performance_id, Cancellation.requested_by == "USER")
    return db.scalar(stmt.limit(1)) is not None


def cancel_by_user(db: Session, user: User, performance_id: int, *, now: datetime) -> tuple[Cancellation, CancelQuote]:
    """AC-F5-08·09: 사용자 취소. 결제 전이면 0원 + (견적서를 받은 공연이면) 반려 기록 (D-53·D-57),
    결제 후면 시점별 위약금을 업체 금액 비율로 나누고 나머지를 환불 예정으로 장부에 남긴다."""
    perf = _owned(db, user, performance_id, lock=True)
    if perf.status not in CANCELABLE_PERF or _user_cancelled(db, perf.id):
        raise invalid_state("지금 상태에서는 취소할 수 없어요. 공연 상태를 다시 확인해 주세요.")
    order = _live_order(db, perf.id, lock=True)
    try:
        phase = _user_phase(perf, order, now)
    except ValueError:
        raise invalid_state("공연 날짜가 지나서 취소할 수 없어요.") from None
    q = _quote(db, perf, order, phase)
    if phase == "BEFORE_PAYMENT":
        rejection.record_rejection(db, perf.id, now=now)
    c = _record(db, perf, order, q, requested_by="USER", fault_supplier_id=None, actor_id=user.id)
    db.commit()
    return c, q


def cancel_by_supplier(db: Session, user: User, performance_id: int, *, reason: str, now: datetime) -> tuple[Cancellation, CancelQuote]:
    """AC-F5-10: 결제한 공연을 확정 업체가 자기 사정으로 취소 → 이용료까지 전액 환불 + 그 업체 경고 1회.
    확정 업체가 아니면 404. 결제 전 업체 취소(D-57 마감 48시간 연장)는 결제 마감(#52 후반, #43 뒤)과 함께 만든다."""
    supplier = db.scalar(select(Supplier).where(Supplier.user_id == user.id))
    perf = db.get(Performance, performance_id, with_for_update=True)
    order = _live_order(db, performance_id, lock=True) if perf else None
    if perf is None or supplier is None or order is None or supplier.id not in {ln.supplier_id for ln in order.lines}:
        raise not_found()
    if order.status not in PAID_STATUSES:
        raise invalid_state("결제가 끝난 공연만 업체 사정으로 취소할 수 있어요.")
    q = _quote(db, perf, order, "SUPPLIER_FAULT")
    policy_service._warn(db, user.id, actor_id=user.id, reason=f"업체 사정 취소: {reason}", report_id=None)
    c = _record(db, perf, order, q, requested_by="SUPPLIER", fault_supplier_id=supplier.id, actor_id=user.id)
    db.commit()
    return c, q
