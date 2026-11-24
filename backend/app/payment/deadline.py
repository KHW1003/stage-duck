"""결제 마감·리마인드·자동 취소 (D-57, AC-F5-22, plan.md 5.7 · 이슈 #52 후반).

마감 = min(처음 컨펌 + 168시간(일반) 또는 48시간(임박: 처음 컨펌일부터 공연까지 13일 이하), 공연 5일 전 0시)
- 리마인드: 일반은 마감 24시간·3시간 전, 임박은 12시간·3시간 전에 사용자에게 PAYMENT_REMINDER 를 회차당 한 번
- 마감이 지나도록 결제하지 않으면: 청구서 취소 + 취소 기록(SYSTEM, 0원) + 채팅을 시작했으면 반려 +1 + 공연 CANCELLED
  + 사용자·확정 업체 모두에게 HOLD_EXPIRED. 결제와 겹치면 청구서 행 잠금으로 결제가 먼저다 (이미 PAID 면 건너뜀)
- 1분마다 run_due() 를 부른다 (app/main.py 의 스케줄러 스레드). 결제 요청 때도 마감을 다시 본다 (pay_order).
- 결제 후 업체 사정 취소로 다시 모집하면 처음 컨펌 대신 그 취소 시각부터 센다 (AC-F5-10).
- 결제 전 업체 사정 취소 한 번마다 마감을 48시간 늘린다 (D-57). 공연 5일 전 0시는 그대로 넘지 않는다.
"""
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.payment import Cancellation, Order
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.notification import service as notification

NORMAL_HOURS = 168
IMMINENT_HOURS = 48
IMMINENT_DAYS = 13
LAST_DAY_BEFORE_SHOW = 5
SUPPLIER_CANCEL_EXTRA_HOURS = 48
WAITING_PERF = ("ASSIGNING", "AWAITING_PAYMENT")  # 처음 컨펌 뒤 결제 전


def is_imminent(first_confirm: datetime, show_date: date) -> bool:
    return (show_date - first_confirm.date()).days <= IMMINENT_DAYS


def deadline_cap(show_date: date) -> datetime:
    """공연 5일 전 0시 — 어떤 마감도 넘지 않는다."""
    return datetime.combine(show_date - timedelta(days=LAST_DAY_BEFORE_SHOW), time(0, 0))


def calc_deadline(first_confirm: datetime, show_date: date, *, supplier_cancels: int = 0) -> datetime:
    """순수 함수: 처음 컨펌 시각과 공연일로 결제 마감 (KST). 결제 전 업체 취소 한 번마다 +48시간 (D-57)."""
    hours = IMMINENT_HOURS if is_imminent(first_confirm, show_date) else NORMAL_HOURS
    hours += SUPPLIER_CANCEL_EXTRA_HOURS * supplier_cancels
    return min(first_confirm + timedelta(hours=hours), deadline_cap(show_date))


def reminder_hours(first_confirm: datetime, show_date: date) -> tuple[int, int]:
    return (12, 3) if is_imminent(first_confirm, show_date) else (24, 3)


def first_confirmed_at(db: Session, performance_id: int) -> datetime | None:
    return db.scalar(
        select(func.min(Stage.confirmed_at)).where(Stage.performance_id == performance_id, Stage.confirmed_at.is_not(None))
    )


def paid_supplier_cancel(db: Session, performance_id: int) -> Cancellation | None:
    """가장 최근의 결제 후 업체 사정 취소. 있으면 그 시각부터 마감을 다시 센다."""
    return db.scalar(
        select(Cancellation)
        .where(Cancellation.performance_id == performance_id, Cancellation.requested_by == "SUPPLIER",
               Cancellation.order_id.is_not(None))
        .order_by(Cancellation.id.desc()).limit(1)
    )


def deadline_for(db: Session, perf: Performance) -> datetime | None:
    if perf.status not in WAITING_PERF:
        return None
    restart = paid_supplier_cancel(db, perf.id)
    first = restart.created_at if restart else first_confirmed_at(db, perf.id)
    if first is None:
        return None
    cancels = db.scalar(select(func.count()).select_from(Cancellation).where(
        Cancellation.performance_id == perf.id, Cancellation.requested_by == "SUPPLIER", Cancellation.order_id.is_(None),
        Cancellation.id > (restart.id if restart else 0),
    ))
    return calc_deadline(first, perf.show_date, supplier_cancels=cancels or 0)


def label(dt: datetime) -> str:
    return f"{dt.month}월 {dt.day}일 {dt.hour:02d}:{dt.minute:02d}"


def _sent_rounds(db: Session, user_id: int, performance_id: int, restart_id: int | None) -> set[int]:
    rows = db.scalars(select(Notification.payload).where(Notification.user_id == user_id, Notification.type == "PAYMENT_REMINDER"))
    return {p.get("round") for p in rows if p and p.get("performanceId") == performance_id
            and p.get("restartId") == restart_id}


def _remind(db: Session, perf: Performance, deadline: datetime, now: datetime) -> int:
    restart = paid_supplier_cancel(db, perf.id)
    restart_id = restart.id if restart else None  # 다시 모집하면 리마인드도 첫 회차부터
    first = restart.created_at if restart else first_confirmed_at(db, perf.id)
    sent = _sent_rounds(db, perf.user_id, perf.id, restart_id)
    count = 0
    for rnd, hours in enumerate(reminder_hours(first, perf.show_date), start=1):
        if now >= deadline - timedelta(hours=hours) and rnd not in sent:
            left = deadline - now
            left_text = f"{max(1, int(left.total_seconds() // 3600))}시간" if left >= timedelta(hours=1) else f"{max(1, int(left.total_seconds() // 60))}분"
            done = perf.status == "AWAITING_PAYMENT"
            notification.notify(
                db, perf.user_id, "PAYMENT_REMINDER",
                link=f"/performances/{perf.id}/order" if done else f"/performances/{perf.id}",
                params={"left": left_text, "title": perf.title, "deadline": label(deadline),
                        "what": "결제" if done else "남은 업체 선택과 결제"},
                payload={"performanceId": perf.id, "round": rnd, "restartId": restart_id},
            )
            sent.add(rnd)
            count += 1
    return count


def expire(db: Session, perf: Performance, now: datetime) -> bool:
    """마감이 지난 미결제 공연을 자동 취소한다. 이미 결제됐거나 상태가 바뀌었으면 False. 커밋하지 않는다."""
    from app.payment import cancel  # 순환 import 피함
    from app.request import rejection
    from app.request import service as request_service

    perf = db.get(Performance, perf.id, with_for_update=True, populate_existing=True)
    if perf.status not in WAITING_PERF:
        return False
    order = cancel._live_order(db, perf.id, lock=True)
    if order is not None and order.status != "ISSUED":
        return False  # 결제가 먼저 끝났다
    supplier_ids = {ln.supplier_id for ln in request_service.confirmed_lines(db, perf.id)}
    supplier_users = list(db.scalars(select(Supplier.user_id).where(Supplier.id.in_(supplier_ids))))
    q = cancel._quote(db, perf, order, "BEFORE_PAYMENT")
    rejection.record_rejection(db, perf.id, now=now)
    cancel._record(db, perf, order, q, requested_by="SYSTEM", fault_supplier_id=None, actor_id=None, now=now)
    request_service.performance_cancelled(db, perf.id, actor_id=None)
    notification.notify(db, perf.user_id, "HOLD_EXPIRED", link=f"/performances/{perf.id}", params={"title": perf.title},
                        payload={"performanceId": perf.id})
    notification.notify_many(db, supplier_users, "HOLD_EXPIRED", link="/supplier/reservations", params={"title": perf.title},
                             payload={"performanceId": perf.id})
    return True


def run_due(db: Session, now: datetime) -> tuple[int, int]:
    """스케줄러 한 번: 리마인드 보낼 것·만료된 것을 처리하고 커밋한다. (리마인드 수, 자동 취소 수)"""
    reminded = expired = 0
    ids = list(db.scalars(
        select(Performance.id).join(Stage, Stage.performance_id == Performance.id)
        .where(Performance.status.in_(WAITING_PERF), Stage.confirmed_at.is_not(None)).distinct()
    ))
    for pid in ids:
        perf = db.get(Performance, pid)
        deadline = deadline_for(db, perf)
        if deadline is None:
            continue
        if now >= deadline:
            if expire(db, perf, now):
                expired += 1
        else:
            reminded += _remind(db, perf, deadline, now)
        db.commit()
    return reminded, expired


def ensure_open(db: Session, order: Order, now: datetime) -> None:
    """결제 직전 확인 (pay_order): 마감이 지났으면 지금 자동 취소하고 409. 커밋은 여기서 한다."""
    from app.core.errors import invalid_state

    perf = db.get(Performance, order.performance_id)
    deadline = deadline_for(db, perf)
    if deadline is not None and now >= deadline:
        expire(db, perf, now)
        db.commit()
        raise invalid_state("결제 마감이 지나 공연이 자동 취소되었습니다. 다시 진행하려면 요청서를 새로 올려 주십시오.")
