"""통합 청구서·결제·취소 서비스 (FR-PAY, 4번 묶음). 계산식은 payment/calc.py 에만 둔다."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import invalid_state, not_found
from app.core.history import record_transition
from app.models.payment import Order, OrderLine
from app.models.request import Performance
from app.models.user import User
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
    raise NotImplementedError("4번 묶음 #51·#52 에서 구현한다 (처음 컨펌 시각은 #43)")


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
        raise invalid_state("아직 확정하지 않은 단계가 있어요. 모든 단계를 확정하거나 건너뛴 뒤 청구서를 볼 수 있어요.")
    lines = request_service.confirmed_lines(db, perf.id)
    if not lines:
        raise invalid_state("확정한 업체가 없어서 청구서를 만들 수 없어요.")
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


def get_order(db: Session, user: User, performance_id: int) -> tuple[Order, dict[int, str]]:
    """AC-F5-03: 내 공연의 유효 청구서와 줄마다 단계 종류 {stage_id: stage_type}. 없으면 404."""
    perf = _my_performance(db, user, performance_id)
    order = _active_order(db, perf.id)
    if order is None:
        raise not_found()
    return order, {s.id: s.stage_type for s in perf.stages}
