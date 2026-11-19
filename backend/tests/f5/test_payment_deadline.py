"""결제 마감·리마인드·자동 취소 — AC-F5-22 (D-57, plan.md 5.7, 이슈 #52 후반)."""
from datetime import date, datetime

import pytest
from sqlalchemy import func, select

from app.main import app
from app.models.notification import Notification
from app.models.payment import Cancellation, Order
from app.models.rejection import RejectionEvent
from app.models.request import Performance, Stage
from app.models.supplier import Supplier
from app.payment import deadline
from app.payment.router import get_now
from tests.f5.test_order import _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)

SHOW = date(2026, 12, 20)
FIRST = datetime(2026, 11, 30, 15, 0)  # 공연 20일 전 15:00 처음 컨펌 → 일반 공연
DEADLINE = datetime(2026, 12, 7, 15, 0)  # +168시간 = 공연 13일 전 15:00


# ---------- 순수 함수 ----------


@pytest.mark.parametrize(
    ("first", "expected", "hours"),
    [
        (FIRST, DEADLINE, (24, 3)),  # 일반: 168시간
        (datetime(2026, 12, 10, 15, 0), datetime(2026, 12, 12, 15, 0), (12, 3)),  # 공연 10일 전 → 임박 48시간
        (datetime(2026, 12, 14, 10, 0), datetime(2026, 12, 15, 0, 0), (12, 3)),  # 공연 5일 전 0시를 넘지 않는다
    ],
)
def test_ac_f5_22_deadline_rules(first, expected, hours):
    assert deadline.calc_deadline(first, SHOW) == expected
    assert deadline.reminder_hours(first, SHOW) == hours


# ---------- 흐름 ----------


def _awaiting(client, db):
    """C·D 확정, 결제 대기, 청구서 발행. 처음 컨펌 = FIRST, 공연일 = SHOW. (사용자 client, 공연 id, (C, D), 청구서 id)"""
    user, perf_id, (c, d) = _ready(client, db)
    db.get(Performance, perf_id).show_date = SHOW
    for st in db.scalars(select(Stage).where(Stage.performance_id == perf_id, Stage.status == "CONFIRMED")):
        st.confirmed_at = FIRST
    db.commit()
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    return user, perf_id, (c, d), order_id


def _types(db, user_id):
    db.expire_all()
    return list(db.scalars(select(Notification.type).where(Notification.user_id == user_id).order_by(Notification.id)))


def _user_id(db, perf_id):
    return db.get(Performance, perf_id).user_id


def test_ac_f5_22_reminders_once_each_then_auto_cancel(client, db):
    user, perf_id, (c, d), order_id = _awaiting(client, db)
    assert user.get(f"/api/v1/performances/{perf_id}").json()["paymentDeadline"].startswith("2026-12-07T15:00")
    assert user.get(f"/api/v1/performances/{perf_id}/order").json()["paymentDeadline"].startswith("2026-12-07T15:00")

    assert deadline.run_due(db, datetime(2026, 12, 6, 14, 0)) == (0, 0)  # 아직 24시간 전 아님
    assert deadline.run_due(db, datetime(2026, 12, 6, 15, 0)) == (1, 0)  # 24시간 전
    assert deadline.run_due(db, datetime(2026, 12, 6, 16, 0)) == (0, 0)  # 같은 회차는 한 번만
    assert deadline.run_due(db, datetime(2026, 12, 7, 12, 30)) == (1, 0)  # 3시간 전
    assert _types(db, _user_id(db, perf_id)).count("PAYMENT_REMINDER") == 2

    assert deadline.run_due(db, datetime(2026, 12, 7, 15, 1)) == (0, 1)  # 마감 지남 → 자동 취소
    db.expire_all()
    assert db.get(Performance, perf_id).status == "CANCELLED"
    assert db.get(Order, order_id).status == "CANCELLED"
    canc = db.scalar(select(Cancellation).where(Cancellation.performance_id == perf_id))
    assert (canc.requested_by, canc.penalty_total, canc.refund_total) == ("SYSTEM", 0, 0)
    assert "HOLD_EXPIRED" in _types(db, _user_id(db, perf_id))
    for sid in (c, d):
        assert "HOLD_EXPIRED" in _types(db, db.get(Supplier, sid).user_id)
    assert deadline.run_due(db, datetime(2026, 12, 7, 15, 2)) == (0, 0)  # 두 번 취소하지 않는다

    # 마감 뒤에는 결제할 수 없다
    app.dependency_overrides[get_now] = lambda: datetime(2026, 12, 7, 16, 0)
    res = user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": 1942500}, headers={"Idempotency-Key": "late"})
    assert res.status_code == 409 and res.json()["code"] == "INVALID_STATE"


def test_ac_f5_22_paying_after_deadline_cancels_on_the_spot(client, db):
    user, perf_id, _, order_id = _awaiting(client, db)
    app.dependency_overrides[get_now] = lambda: datetime(2026, 12, 7, 15, 30)  # 스케줄러보다 결제가 먼저 온 경우

    res = user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": 1942500}, headers={"Idempotency-Key": "k"})

    assert res.status_code == 409 and "결제 마감이 지나" in res.json()["message"]
    db.expire_all()
    assert db.get(Performance, perf_id).status == "CANCELLED"


def test_paid_before_deadline_is_confirmed_and_never_cancelled(client, db):
    user, perf_id, _, order_id = _awaiting(client, db)
    app.dependency_overrides[get_now] = lambda: datetime(2026, 12, 1, 10, 0)
    res = user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": 1942500}, headers={"Idempotency-Key": "k"})
    assert res.json()["status"] == "SUCCEEDED"

    db.expire_all()
    assert db.get(Performance, perf_id).status == "CONFIRMED"  # 결제 성공 → 섭외 확정 (performance_paid)
    assert deadline.run_due(db, datetime(2026, 12, 8, 0, 0)) == (0, 0)
    assert user.get(f"/api/v1/performances/{perf_id}").json()["paymentDeadline"] is None


def test_auto_cancel_counts_rejection_only_when_quotes_existed(client, db):
    user, perf_id, _, _ = _awaiting(client, db)
    before = db.scalar(select(func.count()).select_from(RejectionEvent))
    deadline.run_due(db, datetime(2026, 12, 8, 0, 0))
    after = db.scalar(select(func.count()).select_from(RejectionEvent))
    assert after == before + 1  # 견적서를 받은 공연 (업체 C·D) → 반려 1회


def test_user_cancel_marks_performance_cancelled(client, db):
    user, perf_id, _, _ = _awaiting(client, db)
    app.dependency_overrides[get_now] = lambda: datetime(2026, 12, 1, 10, 0)
    assert user.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 200
    db.expire_all()
    assert db.get(Performance, perf_id).status == "CANCELLED"
