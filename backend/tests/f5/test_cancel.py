"""취소·위약금·업체 사정 취소 API (T4-07 #52, FR-PAY-03, AC-F5-08·09·10, D-57).

공연 2026-11-28, 업체 C 500,000 + D 1,350,000 = 1,850,000, 이용료 92,500, 결제 1,942,500 (2026-11-20 10:00 결제).
"""
from datetime import datetime

import pytest
from sqlalchemy import func, select

from app.main import app
from app.models.payment import Cancellation, LedgerEntry, Order
from app.models.rejection import RejectionEvent
from app.models.supplier import Supplier
from app.models.user import User
from app.payment.router import get_now
from tests.conftest import make_supplier, make_user
from tests.f2.test_quotes import _as
from tests.f5.test_order import NOW, _fixed_now, _fixed_today, _ready  # noqa: F401 (픽스처)

TOTAL = 1942500


def _at(when: datetime):
    app.dependency_overrides[get_now] = lambda: when


def _paid(client, db):
    user, perf_id, (c, d) = _ready(client, db)
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    assert user.post(f"/api/v1/orders/{order_id}/payments", json={"amount": TOTAL},
                     headers={"Idempotency-Key": "k"}).json()["status"] == "SUCCEEDED"
    return user, perf_id, order_id, (c, d)


def _ledger(db, order_id):
    db.expire_all()
    return [(e.supplier_id, e.entry_type, e.amount) for e in
            db.scalars(select(LedgerEntry).where(LedgerEntry.order_id == order_id).order_by(LedgerEntry.id))]


def test_ac_f5_08_d1_user_cancel_70_percent_split_by_amount(client, db):
    user, perf_id, order_id, (c, d) = _paid(client, db)
    _at(datetime(2026, 11, 27, 10, 0))  # D-1

    preview = user.get(f"/api/v1/performances/{perf_id}/cancel-quote").json()
    res = user.post(f"/api/v1/performances/{perf_id}/cancel")

    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["phase"], out["ratePercent"], out["paid"], out["penaltyTotal"], out["feeRefunded"], out["refundTotal"]) == (
        "D1", 70, TOTAL, 1295000, 0, 555000)
    assert [(p["supplierId"], p["amount"]) for p in out["penaltyBySupplier"]] == [(c, 350000), (d, 945000)]
    assert {k: v for k, v in out.items() if k != "cancellationId"} == {k: v for k, v in preview.items() if k != "cancellationId"}
    assert _ledger(db, order_id)[-3:] == [(c, "PENALTY", 350000), (d, "PENALTY", 945000), (None, "REFUND", -555000)]
    assert db.get(Order, order_id).status == "CANCELLED"
    row = db.get(Cancellation, out["cancellationId"])
    assert (row.requested_by, row.phase, row.rate_percent, row.penalty_total, row.refund_total) == ("USER", "D1", 70, 1295000, 555000)


@pytest.mark.parametrize(("when", "phase", "refund"), [
    (datetime(2026, 11, 20, 21, 59), "GRACE_12H", TOTAL),  # 결제 후 11시간 59분 — 이용료까지
    (datetime(2026, 11, 21, 10, 0), "D7_D2", 925000),  # 결제 후 24시간, D-7 → 50%
    (datetime(2026, 11, 28, 9, 0), "D0", 0),  # 당일 100%
])
def test_ac_f5_08_phase_by_time(client, db, when, phase, refund):
    user, perf_id, _, _ = _paid(client, db)
    _at(when)
    out = user.get(f"/api/v1/performances/{perf_id}/cancel-quote").json()
    assert (out["phase"], out["refundTotal"]) == (phase, refund)


def test_ac_f5_09_before_payment_cancel_is_free_and_counts_rejection(client, db):
    user, perf_id, _ = _ready(client, db)
    order_id = user.post(f"/api/v1/performances/{perf_id}/order").json()["id"]
    before = db.scalar(select(func.count()).select_from(RejectionEvent))

    out = user.post(f"/api/v1/performances/{perf_id}/cancel").json()

    assert (out["phase"], out["paid"], out["penaltyTotal"], out["refundTotal"], out["penaltyBySupplier"]) == (
        "BEFORE_PAYMENT", 0, 0, 0, [])
    db.expire_all()
    assert db.get(Order, order_id).status == "CANCELLED"
    assert _ledger(db, order_id) == []
    assert db.scalar(select(func.count()).select_from(RejectionEvent)) == before + 1  # 견적서를 받은 공연 → 반려 (D-57)
    again = user.post(f"/api/v1/performances/{perf_id}/cancel")
    assert (again.status_code, again.json()["code"]) == (409, "INVALID_STATE")


def test_ac_f5_10_supplier_fault_full_refund_and_warning(client, db):
    _, perf_id, order_id, (c, d) = _paid(client, db)
    supplier_c = db.get(Supplier, c)
    warnings = db.get(User, supplier_c.user_id).warning_count

    res = _as(db, supplier_c.user).post(f"/api/v1/performances/{perf_id}/cancel-by-supplier", json={"reason": "공간 누수"})

    assert res.status_code == 200, res.text
    out = res.json()
    assert (out["phase"], out["penaltyTotal"], out["feeRefunded"], out["refundTotal"]) == ("SUPPLIER_FAULT", 0, 92500, TOTAL)
    db.expire_all()
    assert db.get(User, supplier_c.user_id).warning_count == warnings + 1
    assert db.get(Order, order_id).status == "CANCELLED"
    assert _ledger(db, order_id)[-1] == (None, "REFUND", -TOTAL)
    row = db.get(Cancellation, out["cancellationId"])
    assert (row.requested_by, row.fault_supplier_id) == ("SUPPLIER", c)


def test_ac_f5_10_supplier_cancel_rules(client, db):
    user, perf_id, _ = _ready(client, db)
    user.post(f"/api/v1/performances/{perf_id}/order")
    order = db.scalar(select(Order).where(Order.performance_id == perf_id))
    supplier = db.get(Supplier, order.lines[0].supplier_id)
    url = f"/api/v1/performances/{perf_id}/cancel-by-supplier"

    res = _as(db, supplier.user).post(url, json={"reason": "사정"})
    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")  # 결제 전
    assert _as(db, supplier.user).post(url, json={"reason": " "}).status_code == 400
    outsider = make_supplier(db, review_status="APPROVED", categories=("VENUE",))
    assert _as(db, outsider.user).post(url, json={"reason": "사정"}).status_code == 404


def test_ac_f5_08_permissions_and_after_show(client, db):
    user, perf_id, _, _ = _paid(client, db)
    other = _as(db, make_user(db))
    assert other.get(f"/api/v1/performances/{perf_id}/cancel-quote").status_code == 404
    assert other.post(f"/api/v1/performances/{perf_id}/cancel").status_code == 404
    _at(datetime(2026, 11, 29, 10, 0))
    res = user.post(f"/api/v1/performances/{perf_id}/cancel")
    assert (res.status_code, res.json()["code"]) == (409, "INVALID_STATE")
    _at(NOW)
