"""통합 청구서·결제·취소 서비스 (FR-PAY, 4번 묶음). 계산식은 payment/calc.py 에만 둔다."""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, invalid_state, not_found
from app.core.history import record_transition
from app.models.payment import LedgerEntry, Order, OrderLine, Payment
from app.models.request import Performance
from app.models.supplier import Supplier
from app.models.user import User
from app.notification import service as notification
from app.payment import calc
from app.request import service as request_service

# shortcut: 이용료율은 Settings.PLATFORM_FEE_RATE 로 옮길 값 (core 수정은 해원 리뷰) — 그때 여기서 읽는다
PLATFORM_FEE_RATE = Decimal("0.05")
DONE_STAGE_STATUSES = ("CONFIRMED", "SKIPPED")
ACTIVE_ORDER_STATUSES = ("ISSUED", "PAID", "SETTLEMENT_SCHEDULED")

# ---------------------------------------------------------------------------
# 묶음 사이 약속 (roles.md 3장, CLAUDE.md 5장) — 4번 → 3번
# 이름·인자를 바꾸려면 쓰는 쪽(3번 채은: 확인 카드 만료, 결제 알림)과 먼저 합의한다.
# ---------------------------------------------------------------------------


def payment_deadline(db: Session, performance_id: int) -> datetime | None:
    """[약속 4 → 3] 그 공연의 최종 결제 마감 시각(KST, D-57). 커밋하지 않는다.

    = min(처음 컨펌 + 168시간(일반) 또는 48시간(임박), 공연 5일 전 0시). 결제 전 업체 취소로 늘어난 48시간 포함.
    아직 처음 컨펌이 없거나 이미 결제했으면 None.
    쓰는 곳: 3번 확인 카드 만료 = min(보낸 뒤 48시간, 이 값) (#43), 결제 알림 문구 (#45).
    구현: 4번 목산 — 처음 컨펌 시각이 생기는 #43 뒤 T4-06·T4-07 (#51, #52).
    """
    from app.payment.deadline import deadline_for  # 순환 import 피함

    perf = db.get(Performance, performance_id)
    return deadline_for(db, perf) if perf is not None else None


# ---------------------------------------------------------------------------
# 통합 청구서 (T4-05 #50, FR-PAY-01, AC-F5-03·04)
# ---------------------------------------------------------------------------


def _my_performance(db: Session, user: User, performance_id: int, *, lock: bool = False) -> Performance:
    """내 공연만 (읽기 전용 참조, 2번 performances). 남의 공연은 404."""
    perf = db.get(Performance, performance_id, with_for_update=lock)
    if perf is None or perf.user_id != user.id:
        raise not_found()
    return perf


def _active_order(db: Session, performance_id: int) -> Order | None:
    return db.scalar(select(Order).where(Order.performance_id == performance_id, Order.status.in_(ACTIVE_ORDER_STATUSES)))


def issue_order(db: Session, user: User, performance_id: int, *, now: datetime) -> tuple[Order, bool]:
    """AC-F5-03·04: 필요한 단계가 모두 확정·건너뜀이면 통합 청구서를 만든다. (청구서, 새로 만들었는지).

    이미 유효한 청구서가 있으면 그대로 돌려준다 (같은 요청 두 번 = 한 번, 공연 행 잠금 + active_guard UNIQUE).
    금액은 확정 견적서 버전 금액(request.confirmed_lines) 합 + 이용료 5%(원 미만 버림).
    """
    perf = _my_performance(db, user, performance_id, lock=True)
    existing = _active_order(db, perf.id)
    if existing is not None:
        return existing, False
    if not perf.stages or any(s.status not in DONE_STAGE_STATUSES for s in perf.stages):
        raise invalid_state("아직 확정하지 않은 단계가 있습니다. 모든 단계를 확정하거나 건너뛴 후 청구서를 볼 수 있습니다.")
    lines = request_service.confirmed_lines(db, perf.id)
    if not lines:
        raise invalid_state("확정한 업체가 없어 청구서를 만들 수 없습니다.")
    amounts = calc.invoice_amounts([line.amount for line in lines], PLATFORM_FEE_RATE)
    order = Order(
        performance_id=perf.id, status="ISSUED", items_total=amounts.items_total, platform_fee=amounts.platform_fee,
        total_amount=amounts.total_amount, issued_at=now,
    )
    db.add(order)
    db.flush()
    db.add_all(
        OrderLine(order_id=order.id, stage_id=line.stage_id, supplier_id=line.supplier_id,
                  quote_version_id=line.quote_version_id, amount=line.amount)
        for line in lines
    )
    record_transition(db, entity_type="order", entity_id=order.id, from_status=None, to_status="ISSUED",
                      actor_user_id=user.id)
    db.commit()
    db.refresh(order)
    return order, True


def supplier_names(db: Session, supplier_ids: list[int]) -> dict[int, str]:
    """청구서 줄에 보일 상호 (읽기 전용 참조, 1번 suppliers). 연락처·사업자 정보는 꺼내지 않는다."""
    rows = db.execute(select(Supplier.id, Supplier.company_name).where(Supplier.id.in_(supplier_ids))).all()
    return dict(rows)


def ledger_state(db: Session, order_id: int) -> dict[int | None, str]:
    """AC-F5-07: 업체(·플랫폼 None)마다 돈의 지금 상태 = 마지막 장부 줄 종류. 결제 전이면 빈 dict."""
    rows = db.execute(
        select(LedgerEntry.supplier_id, LedgerEntry.entry_type).where(LedgerEntry.order_id == order_id).order_by(LedgerEntry.id)
    ).all()
    return {supplier_id: entry_type for supplier_id, entry_type in rows}


def get_order(db: Session, user: User, performance_id: int) -> tuple[Order, dict[int, str]]:
    """AC-F5-03: 내 공연의 유효 청구서와 줄마다 단계 종류 {stage_id: stage_type}. 없으면 404."""
    perf = _my_performance(db, user, performance_id)
    order = _active_order(db, perf.id)
    if order is None:
        raise not_found()
    return order, {s.id: s.stage_type for s in perf.stages}


# ---------------------------------------------------------------------------
# 에스크로형 모의 결제·장부 (T4-06 #51, FR-PAY-02, AC-F5-05~07). 실제 돈은 움직이지 않는다 (constitution 8)
# ---------------------------------------------------------------------------
_ORDER_ALLOWED = {"ISSUED": {"PAID", "CANCELLED"}, "PAID": {"SETTLEMENT_SCHEDULED", "CANCELLED"}}


def _move_order(db: Session, order: Order, to: str, actor_id: int | None) -> None:
    if to not in _ORDER_ALLOWED.get(order.status, set()):
        raise invalid_state("지금 청구서 상태에서는 진행할 수 없습니다.")
    record_transition(db, entity_type="order", entity_id=order.id, from_status=order.status, to_status=to,
                      actor_user_id=actor_id)
    order.status = to


def _payment_by_key(db: Session, key: str) -> Payment | None:
    return db.scalar(select(Payment).where(Payment.idempotency_key == key))


def _apply_result(db: Session, payment: Payment, result: str, *, now: datetime, actor_id: int | None) -> None:
    """모의 결제 결과를 한 번만 반영한다. 이미 끝난 결제(SUCCEEDED·FAILED)면 아무것도 하지 않는다 (AC-F5-06)."""
    if payment.status != "PENDING":
        return
    if result != "SUCCESS":
        payment.status, payment.completed_at = "FAILED", now
        return
    order = db.get(Order, payment.order_id, with_for_update=True)
    payment.status, payment.completed_at = "SUCCEEDED", now
    _move_order(db, order, "PAID", actor_id)
    order.paid_at = now
    request_service.performance_paid(db, order.performance_id, actor_id=actor_id)  # 결제 대기 → 섭외 확정 (2번 약속)
    # 결제금은 플랫폼이 보관 (보관 중). 업체 몫은 업체별로, 이용료는 플랫폼 몫
    db.add_all(LedgerEntry(order_id=order.id, supplier_id=line.supplier_id, entry_type="HOLD", amount=line.amount,
                           memo="결제금 보관 (업체 몫)") for line in order.lines)
    db.add(LedgerEntry(order_id=order.id, supplier_id=None, entry_type="PLATFORM_FEE", amount=order.platform_fee,
                       memo="플랫폼 이용료"))
    # #45 확정 업체 모두에게 PAID (사용자는 본인이 결제했으므로 받지 않는다)
    perf = db.get(Performance, order.performance_id)
    supplier_users = db.scalars(select(Supplier.user_id).where(Supplier.id.in_({ln.supplier_id for ln in order.lines})))
    notification.notify_many(
        db, supplier_users, "PAID", link=f"/performances/{perf.id}/sheet", params={"title": perf.title},
        payload={"performanceId": perf.id, "orderId": order.id},
    )


def pay_order(
    db: Session, user: User, order_id: int, *, amount: int, mock_result: str, idempotency_key: str, now: datetime
) -> tuple[Payment, Order]:
    """AC-F5-05·06: 테스트 결제. 금액은 서버 계산값과 같아야 하고(400 AMOUNT_MISMATCH),
    같은 Idempotency-Key 로 다시 오면 처음 결과를 그대로 돌려준다. 다른 키로 두 번 눌러도 청구서 행 잠금으로 한 번만 결제된다.
    """
    order = db.get(Order, order_id, with_for_update=True)
    if order is None or db.get(Performance, order.performance_id).user_id != user.id:
        raise not_found()
    existing = _payment_by_key(db, idempotency_key)
    if existing is not None:
        if existing.order_id != order.id:
            raise not_found()
        return existing, order
    if order.status != "ISSUED":
        raise invalid_state("이미 결제했거나 취소된 청구서입니다. 청구서를 다시 확인해 주십시오.")
    from app.payment.deadline import ensure_open  # D-57: 마감이 지났으면 자동 취소하고 409

    ensure_open(db, order, now)
    if amount != order.total_amount:
        raise AppError(400, "AMOUNT_MISMATCH", "결제 금액이 청구서 금액과 다릅니다. 화면을 새로 고친 후 다시 결제해 주십시오.")
    payment = Payment(order_id=order.id, idempotency_key=idempotency_key, provider_tx_id=f"mock-{uuid.uuid4().hex}",
                      amount=order.total_amount, status="PENDING")
    db.add(payment)
    try:
        db.flush()
    except IntegrityError:  # 같은 키가 동시에 들어온 경우 — 먼저 들어온 결과를 돌려준다
        db.rollback()
        existing = _payment_by_key(db, idempotency_key)
        if existing is None or existing.order_id != order_id:
            raise
        return existing, db.get(Order, order_id)
    _apply_result(db, payment, mock_result, now=now, actor_id=user.id)
    db.commit()
    return payment, order


def apply_mock_callback(db: Session, provider_tx_id: str, result: str, *, now: datetime) -> Payment:
    """AC-F5-06: 모의 결제 결과 콜백. 같은 providerTxId 가 여러 번 와도 한 번만 반영한다. 모르는 번호는 404."""
    payment = db.scalar(select(Payment).where(Payment.provider_tx_id == provider_tx_id).with_for_update())
    if payment is None:
        raise not_found()
    _apply_result(db, payment, result, now=now, actor_id=None)
    db.commit()
    return payment


def settle_completed_orders(db: Session, *, now: datetime) -> int:
    """AC-F5-07: 공연이 끝난(공연 날짜·종료 시각이 지난) 결제 완료 청구서 → 정산 예정. 업체별 장부 SETTLE_SCHEDULED.

    스케줄러(core/scheduler.py)가 1분마다 부른다 (plan.md 5.7 "공연 완료"). 처리한 청구서 수를 돌려준다.
    확정 업체마다 SETTLEMENT_SCHEDULED 알림 한 번 (여러 단계를 맡았으면 금액을 합쳐서). 공연 상태 COMPLETED 전환은 2번 묶음 몫.
    """
    ids = db.execute(
        select(Order.id, Order.performance_id).join(Performance, Performance.id == Order.performance_id)
        .where(Order.status == "PAID", Performance.show_date <= now.date())
    ).all()
    done = 0
    for order_id, performance_id in ids:
        # 공연 → 청구서 순서로 하나씩 잠근다 (취소와 같은 순서). 그 사이 취소됐으면 건너뛴다
        perf = db.get(Performance, performance_id, with_for_update=True, populate_existing=True)
        order = db.get(Order, order_id, with_for_update=True, populate_existing=True)
        if order.status != "PAID" or datetime.combine(perf.show_date, perf.show_end) > now:
            db.rollback()
            continue
        _move_order(db, order, "SETTLEMENT_SCHEDULED", None)
        db.add_all(LedgerEntry(order_id=order.id, supplier_id=line.supplier_id, entry_type="SETTLE_SCHEDULED",
                               amount=line.amount, memo="공연 완료 — 정산 예정") for line in order.lines)
        amounts: dict[int, int] = {}
        for line in order.lines:
            amounts[line.supplier_id] = amounts.get(line.supplier_id, 0) + line.amount
        for supplier_id, user_id in db.execute(select(Supplier.id, Supplier.user_id).where(Supplier.id.in_(amounts))).all():
            notification.notify(
                db, user_id, "SETTLEMENT_SCHEDULED", link="/supplier/reservations",
                params={"title": perf.title, "amount": notification.won(amounts[supplier_id])},
                payload={"performanceId": perf.id, "orderId": order.id},
            )
        db.commit()
        done += 1
    return done
