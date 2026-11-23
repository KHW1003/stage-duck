"""승인 업체가 맡은 공연의 예약 요약."""
from dataclasses import dataclass, field
from datetime import date, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.payment import Cancellation, Order
from app.models.quote import Quote, QuoteVersion
from app.models.request import Performance, Stage
from app.models.user import User
from app.payment.sheet import PAID_STATUSES
from app.supplier import service as supplier_service


@dataclass
class Reservation:
    performance_id: int
    title: str
    show_date: date
    show_start: time
    show_end: time
    sido: str
    sigungu: str
    status: str
    stage_types: list[str] = field(default_factory=list)
    amount: int = 0


def _status(
    performance_status: str,
    order_status: str | None,
    cancelled_by_team: bool,
    cancelling_supplier_id: int | None,
    supplier_id: int,
) -> str:
    if cancelled_by_team or performance_status in ("CANCELLED", "WITHDRAWN"):
        return "CANCELLED"
    if order_status == "CANCELLED":
        # 다시 모집 중이면 취소된 청구서는 지난 것 — 남은 업체의 예약은 유지된다 (D-37)
        if performance_status == "ASSIGNING":
            return "ASSIGNING" if cancelling_supplier_id in (None, supplier_id) else "NEEDS_REVIEW"
        if performance_status != "AWAITING_PAYMENT":
            return "CANCELLED" if cancelling_supplier_id in (None, supplier_id) else "NEEDS_REVIEW"
    if performance_status == "COMPLETED":
        return "COMPLETED"
    if order_status == "SETTLEMENT_SCHEDULED":  # 공연이 끝나 정산 예정 — 화면은 "공연 완료", 취소 버튼 없음 (AC-F5-07)
        return "COMPLETED"
    if order_status in PAID_STATUSES:
        return "PAID"
    if order_status == "ISSUED" or performance_status == "AWAITING_PAYMENT":
        return "AWAITING_PAYMENT"
    return "ASSIGNING"


def list_reservations(db: Session, user: User) -> list[Reservation]:
    supplier = supplier_service.get_application(db, user)
    if not supplier_service.can_send_quotes(supplier):
        raise AppError(403, "SUPPLIER_NOT_APPROVED", "입점 승인이 완료되면 예약을 볼 수 있어요.")

    latest_order_id = (
        select(Order.id)
        .where(Order.performance_id == Performance.id)
        .order_by(Order.id.desc())
        .limit(1)
        .correlate(Performance)
        .scalar_subquery()
    )
    # 공연 상태와 확정 견적은 취소 후에도 남을 수 있어 취소 기록도 읽는다.
    team_cancelled = (
        select(Cancellation.id)
        .where(Cancellation.performance_id == Performance.id, Cancellation.requested_by == "USER")
        .correlate(Performance)
        .exists()
    )
    cancelling_supplier = (
        select(Cancellation.fault_supplier_id)
        .where(Cancellation.order_id == Order.id, Cancellation.requested_by == "SUPPLIER")
        .order_by(Cancellation.id.desc())
        .limit(1)
        .correlate(Order)
        .scalar_subquery()
    )
    rows = db.execute(
        select(
            Performance.id, Performance.title, Performance.show_date, Performance.show_start,
            Performance.show_end, Performance.sido, Performance.sigungu, Performance.status,
            Stage.stage_type, QuoteVersion.total_amount, Order.status, team_cancelled, cancelling_supplier,
        )
        .select_from(Performance)
        .join(Stage, Stage.performance_id == Performance.id)
        .join(QuoteVersion, QuoteVersion.id == Stage.confirmed_quote_version_id)
        .join(Quote, Quote.id == QuoteVersion.quote_id)
        .outerjoin(Order, Order.id == latest_order_id)
        .where(Quote.supplier_id == supplier.id, Stage.status == "CONFIRMED")
        .order_by(Performance.show_date, Performance.show_start, Performance.id, Stage.seq)
    )

    reservations: dict[int, Reservation] = {}
    for pid, title, day, start, end, sido, sigungu, state, stage, amount, order_state, cancelled, fault in rows:
        if pid not in reservations:
            reservations[pid] = Reservation(
                pid, title, day, start, end, sido, sigungu,
                _status(state, order_state, cancelled, fault, supplier.id),
            )
        reservations[pid].stage_types.append(stage)
        reservations[pid].amount += amount
    return list(reservations.values())
